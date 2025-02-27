import { AutoCastable, ResourcePolicyDenyError, Also, Prop, RPCReflection } from 'civkit/civ-rpc';
import { AsyncService } from 'civkit/async-service';
import { getTraceId } from 'civkit/async-context';
import { singleton, container } from 'tsyringe';

import { RateLimitTriggeredError } from './errors';
import { FirestoreRecord } from './firestore';
import { GlobalLogger } from './logger';

export enum API_CALL_STATUS {
    SUCCESS = 'success',
    ERROR = 'error',
    PENDING = 'pending',
}

@Also({ dictOf: Object })
export class APICall extends FirestoreRecord {
    static override collectionName = 'apiRoll';

    @Prop({
        required: true,
        defaultFactory: () => getTraceId()
    })
    traceId!: string;

    @Prop()
    uid?: string;

    @Prop()
    ip?: string;

    @Prop({
        arrayOf: String,
        default: [],
    })
    tags!: string[];

    @Prop({
        required: true,
        defaultFactory: () => new Date(),
    })
    createdAt!: Date;

    @Prop()
    completedAt?: Date;

    @Prop({
        required: true,
        default: API_CALL_STATUS.PENDING,
    })
    status!: API_CALL_STATUS;

    @Prop({
        required: true,
        defaultFactory: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    })
    expireAt!: Date;

    [k: string]: any;

    tag(...tags: string[]) {
        for (const t of tags) {
            if (!this.tags.includes(t)) {
                this.tags.push(t);
            }
        }
    }

    save() {
        return (this.constructor as typeof APICall).save(this);
    }
}


export class RateLimitDesc extends AutoCastable {
    @Prop({
        default: 1000
    })
    occurrence!: number;

    @Prop({
        default: 3600
    })
    periodSeconds!: number;

    @Prop()
    notBefore?: Date;

    @Prop()
    notAfter?: Date;

    isEffective() {
        const now = new Date();
        if (this.notBefore && this.notBefore > now) {
            return false;
        }
        if (this.notAfter && this.notAfter < now) {
            return false;
        }

        return true;
    }
}


@singleton()
export class RateLimitControl extends AsyncService {

    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(
        protected globalLogger: GlobalLogger,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();

        this.emit('ready');
    }

    async queryByUid(uid: string, pointInTime: Date, ...tags: string[]) {
        let q = APICall.COLLECTION
            .orderBy('createdAt', 'asc')
            .where('createdAt', '>=', pointInTime)
            .where('status', 'in', [API_CALL_STATUS.SUCCESS, API_CALL_STATUS.PENDING])
            .where('uid', '==', uid);
        if (tags.length) {
            q = q.where('tags', 'array-contains-any', tags);
        }

        return APICall.fromFirestoreQuery(q);
    }

    async queryByIp(ip: string, pointInTime: Date, ...tags: string[]) {
        let q = APICall.COLLECTION
            .orderBy('createdAt', 'asc')
            .where('createdAt', '>=', pointInTime)
            .where('status', 'in', [API_CALL_STATUS.SUCCESS, API_CALL_STATUS.PENDING])
            .where('ip', '==', ip);
        if (tags.length) {
            q = q.where('tags', 'array-contains-any', tags);
        }

        return APICall.fromFirestoreQuery(q);
    }

    async assertUidPeriodicLimit(uid: string, pointInTime: Date, limit: number, ...tags: string[]) {
        if (limit <= 0) {
            throw new ResourcePolicyDenyError(`This UID(${uid}) is not allowed to call this endpoint (rate limit quota is 0).`);
        }

        let q = APICall.COLLECTION
            .orderBy('createdAt', 'asc')
            .where('createdAt', '>=', pointInTime)
            .where('status', 'in', [API_CALL_STATUS.SUCCESS, API_CALL_STATUS.PENDING])
            .where('uid', '==', uid);
        if (tags.length) {
            q = q.where('tags', 'array-contains-any', tags);
        }
        const count = (await q.count().get()).data().count;

        if (count >= limit) {
            const r = await APICall.fromFirestoreQuery(q.limit(1));
            const [r1] = r;

            const dtMs = Math.abs(r1.createdAt?.valueOf() - pointInTime.valueOf());
            const dtSec = Math.ceil(dtMs / 1000);

            throw RateLimitTriggeredError.from({
                message: `Per UID rate limit exceeded (${tags.join(',') || 'called'} ${limit} times since ${pointInTime})`,
                retryAfter: dtSec,
            });
        }

        return count + 1;
    }

    async assertIPPeriodicLimit(ip: string, pointInTime: Date, limit: number, ...tags: string[]) {
        let q = APICall.COLLECTION
            .orderBy('createdAt', 'asc')
            .where('createdAt', '>=', pointInTime)
            .where('status', 'in', [API_CALL_STATUS.SUCCESS, API_CALL_STATUS.PENDING])
            .where('ip', '==', ip);
        if (tags.length) {
            q = q.where('tags', 'array-contains-any', tags);
        }

        const count = (await q.count().get()).data().count;

        if (count >= limit) {
            const r = await APICall.fromFirestoreQuery(q.limit(1));
            const [r1] = r;

            const dtMs = Math.abs(r1.createdAt?.valueOf() - pointInTime.valueOf());
            const dtSec = Math.ceil(dtMs / 1000);

            throw RateLimitTriggeredError.from({
                message: `Per IP rate limit exceeded (${tags.join(',') || 'called'} ${limit} times since ${pointInTime})`,
                retryAfter: dtSec,
            });
        }

        return count + 1;
    }

    record(partialRecord: Partial<APICall>) {
        const record = APICall.from(partialRecord);
        const newId = APICall.COLLECTION.doc().id;
        record._id = newId;

        return record;
    }

    async simpleRPCUidBasedLimit(rpcReflect: RPCReflection, uid: string, tags: string[] = [],
        ...inputCriterion: RateLimitDesc[] | [Date, number][]) {
        const criterion = inputCriterion.map((c) => { return Array.isArray(c) ? c : this.rateLimitDescToCriterion(c); });

        await Promise.all(criterion.map(([pointInTime, n]) =>
            this.assertUidPeriodicLimit(uid, pointInTime, n, ...tags)));

        const r = this.record({
            uid,
            tags,
        });

        r.save().catch((err) => this.logger.warn(`Failed to save rate limit record`, { err }));
        rpcReflect.then(() => {
            r.status = API_CALL_STATUS.SUCCESS;
            r.save()
                .catch((err) => this.logger.warn(`Failed to save rate limit record`, { err }));
        });
        rpcReflect.catch((err) => {
            r.status = API_CALL_STATUS.ERROR;
            r.error = err.toString();
            r.save()
                .catch((err) => this.logger.warn(`Failed to save rate limit record`, { err }));
        });

        return r;
    }

    rateLimitDescToCriterion(rateLimitDesc: RateLimitDesc) {
        return [new Date(Date.now() - rateLimitDesc.periodSeconds * 1000), rateLimitDesc.occurrence] as [Date, number];
    }

    async simpleRpcIPBasedLimit(rpcReflect: RPCReflection, ip: string, tags: string[] = [],
        ...inputCriterion: RateLimitDesc[] | [Date, number][]) {
        const criterion = inputCriterion.map((c) => { return Array.isArray(c) ? c : this.rateLimitDescToCriterion(c); });
        await Promise.all(criterion.map(([pointInTime, n]) =>
            this.assertIPPeriodicLimit(ip, pointInTime, n, ...tags)));

        const r = this.record({
            ip,
            tags,
        });

        r.save().catch((err) => this.logger.warn(`Failed to save rate limit record`, { err }));
        rpcReflect.then(() => {
            r.status = API_CALL_STATUS.SUCCESS;
            r.save()
                .catch((err) => this.logger.warn(`Failed to save rate limit record`, { err }));
        });
        rpcReflect.catch((err) => {
            r.status = API_CALL_STATUS.ERROR;
            r.error = err.toString();
            r.save()
                .catch((err) => this.logger.warn(`Failed to save rate limit record`, { err }));
        });

        return r;
    }
}

const instance = container.resolve(RateLimitControl);

export default instance;
