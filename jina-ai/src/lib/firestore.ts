import _ from 'lodash';
import { AutoCastable, Prop, RPC_MARSHAL } from 'civkit/civ-rpc';
import {
    Firestore, FieldValue, DocumentReference,
    Query, Timestamp, SetOptions, DocumentSnapshot,
} from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

export const firebaseDefaultBucket = new Storage().bucket(`${process.env.GCLOUD_PROJECT}.appspot.com`);

// Firestore doesn't support JavaScript objects with custom prototypes (i.e. objects that were created via the \"new\" operator)
function patchFireStoreArrogance(func: Function) {
    return function (this: unknown) {
        const origObjectGetPrototype = Object.getPrototypeOf;
        Object.getPrototypeOf = function (x) {
            const r = origObjectGetPrototype.call(this, x);
            if (!r) {
                return r;
            }
            return Object.prototype;
        };
        try {
            return func.call(this, ...arguments);
        } finally {
            Object.getPrototypeOf = origObjectGetPrototype;
        }
    };
}

Reflect.set(DocumentReference.prototype, 'set', patchFireStoreArrogance(Reflect.get(DocumentReference.prototype, 'set')));
Reflect.set(DocumentSnapshot, 'fromObject', patchFireStoreArrogance(Reflect.get(DocumentSnapshot, 'fromObject')));

function mapValuesDeep(v: any, fn: (i: any) => any): any {
    if (_.isPlainObject(v)) {
        return _.mapValues(v, (i) => mapValuesDeep(i, fn));
    } else if (_.isArray(v)) {
        return v.map((i) => mapValuesDeep(i, fn));
    } else {
        return fn(v);
    }
}

export type Constructor<T> = { new(...args: any[]): T; };
export type Constructed<T> = T extends Partial<infer U> ? U : T extends object ? T : object;

export function fromFirestore<T extends FirestoreRecord>(
    this: Constructor<T>, id: string, overrideCollection?: string
): Promise<T | undefined>;
export async function fromFirestore(
    this: any, id: string, overrideCollection?: string
) {
    const collection = overrideCollection || this.collectionName;
    if (!collection) {
        throw new Error(`Missing collection name to construct ${this.name}`);
    }

    const ref = this.DB.collection(overrideCollection || this.collectionName).doc(id);

    const ptr = await ref.get();

    if (!ptr.exists) {
        return undefined;
    }

    const doc = this.from(
        // Fixes non-native firebase types
        mapValuesDeep(ptr.data(), (i: any) => {
            if (i instanceof Timestamp) {
                return i.toDate();
            }

            return i;
        })
    );

    Object.defineProperty(doc, '_ref', { value: ref, enumerable: false });
    Object.defineProperty(doc, '_id', { value: ptr.id, enumerable: true });

    return doc;
}

export function fromFirestoreQuery<T extends FirestoreRecord>(
    this: Constructor<T>, query: Query
): Promise<T[]>;
export async function fromFirestoreQuery(this: any, query: Query) {
    const ptr = await query.get();

    if (ptr.docs.length) {
        return ptr.docs.map(doc => {
            const r = this.from(
                mapValuesDeep(doc.data(), (i: any) => {
                    if (i instanceof Timestamp) {
                        return i.toDate();
                    }

                    return i;
                })
            );
            Object.defineProperty(r, '_ref', { value: doc.ref, enumerable: false });
            Object.defineProperty(r, '_id', { value: doc.id, enumerable: true });

            return r;
        });
    }

    return [];
}

export function setToFirestore<T extends FirestoreRecord>(
    this: Constructor<T>, doc: T, overrideCollection?: string, setOptions?: SetOptions
): Promise<T>;
export async function setToFirestore(
    this: any, doc: any, overrideCollection?: string, setOptions?: SetOptions
) {
    let ref: DocumentReference<any> = doc._ref;
    if (!ref) {
        const collection = overrideCollection || this.collectionName;
        if (!collection) {
            throw new Error(`Missing collection name to construct ${this.name}`);
        }

        const predefinedId = doc._id || undefined;
        const hdl = this.DB.collection(overrideCollection || this.collectionName);
        ref = predefinedId ? hdl.doc(predefinedId) : hdl.doc();

        Object.defineProperty(doc, '_ref', { value: ref, enumerable: false });
        Object.defineProperty(doc, '_id', { value: ref.id, enumerable: true });
    }

    await ref.set(doc, { merge: true, ...setOptions });

    return doc;
}

export function deleteQueryBatch<T extends FirestoreRecord>(
    this: Constructor<T>, query: Query
): Promise<T>;
export async function deleteQueryBatch(this: any, query: Query) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        return;
    }

    // Delete documents in a batch
    const batch = this.DB.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        this.deleteQueryBatch(query);
    });
};

export function fromFirestoreDoc<T extends FirestoreRecord>(
    this: Constructor<T>, snapshot: DocumentSnapshot,
): T | undefined;
export function fromFirestoreDoc(
    this: any, snapshot: DocumentSnapshot,
) {
    const doc = this.from(
        // Fixes non-native firebase types
        mapValuesDeep(snapshot.data(), (i: any) => {
            if (i instanceof Timestamp) {
                return i.toDate();
            }

            return i;
        })
    );

    Object.defineProperty(doc, '_ref', { value: snapshot.ref, enumerable: false });
    Object.defineProperty(doc, '_id', { value: snapshot.id, enumerable: true });

    return doc;
}
const defaultFireStore = new Firestore({
    projectId: process.env.GCLOUD_PROJECT,
});
export class FirestoreRecord extends AutoCastable {
    static collectionName?: string;
    static OPS = FieldValue;
    static DB = defaultFireStore;
    static get COLLECTION() {
        if (!this.collectionName) {
            throw new Error('Not implemented');
        }

        return this.DB.collection(this.collectionName);
    }

    @Prop()
    _id?: string;
    _ref?: DocumentReference<Partial<Omit<this, '_ref' | '_id'>>>;

    static fromFirestore = fromFirestore;
    static fromFirestoreDoc = fromFirestoreDoc;
    static fromFirestoreQuery = fromFirestoreQuery;

    static save = setToFirestore;
    static deleteQueryBatch = deleteQueryBatch;

    [RPC_MARSHAL]() {
        return {
            ...this,
            _id: this._id,
            _ref: this._ref?.path
        };
    }

    degradeForFireStore(): this {
        return JSON.parse(JSON.stringify(this, function (k, v) {
            if (k === '') {
                return v;
            }
            if (typeof v === 'object' && v && (typeof v.degradeForFireStore === 'function')) {
                return v.degradeForFireStore();
            }

            return v;
        }));
    }
}
