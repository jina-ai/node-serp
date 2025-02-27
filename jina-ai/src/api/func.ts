import { singleton } from 'tsyringe';
import _ from 'lodash';
import { ParamValidationError, RPCHost, RPCReflection } from 'civkit/civ-rpc';
import { GlobalLogger } from '../lib/logger';
import { Ctx, Method, RPCReflect } from '../lib/registry';
import { marshalErrorLike } from 'civkit/lang';
import { JinaEmbeddingsAuthDTO } from '../dto/jina-embeddings-auth';
import { Context } from 'koa';
import { InsufficientBalanceError } from '../lib/errors';
import { RateLimitControl, RateLimitDesc } from '../lib/rate-limit';
import { AsyncLocalContext } from '../lib/async-context';

const func = require('../../..').default;


@singleton()
export class FuncHost extends RPCHost {
    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(
        protected globalLogger: GlobalLogger,
        protected rateLimitControl: RateLimitControl,
        protected threadLocal: AsyncLocalContext,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();

        this.emit('ready');
    }

    @Method({
        ext: {
            http: {
                action: ['post', 'get'],
                path: '/'
            }
        },
        tags: ['serp'],
        returnType: [Object],
        envelope: null,
    })
    async serpFunc(
        @Ctx() ctx: Context,
        @RPCReflect() rpcReflect: RPCReflection,
        auth: JinaEmbeddingsAuthDTO
    ) {
        const uid = await auth.solveUID();
        let chargeAmount = 0;
        
        if (uid) {
            const user = await auth.assertUser();
            if (!(user.wallet.total_balance > 0)) {
                throw new InsufficientBalanceError(`Account balance not enough to run this query, please recharge.`);
            }

            const rateLimitPolicy = auth.getRateLimits(rpcReflect.name.toUpperCase()) || [
                parseInt(user.metadata?.speed_level) >= 2 ?
                    RateLimitDesc.from({
                        occurrence: 30,
                        periodSeconds: 60
                    }) :
                    RateLimitDesc.from({
                        occurrence: 10,
                        periodSeconds: 60
                    })
            ];

            const apiRoll = await this.rateLimitControl.simpleRPCUidBasedLimit(
                rpcReflect, uid, [rpcReflect.name.toUpperCase()],
                ...rateLimitPolicy
            );

            rpcReflect.finally(() => {
                // if (crawlerOptions.tokenBudget && chargeAmount > crawlerOptions.tokenBudget) {
                //     return;
                // }
                if (chargeAmount) {
                    auth.reportUsage(chargeAmount, `reader-${rpcReflect.name}`).catch((err) => {
                        this.logger.warn(`Unable to report usage for ${uid}`, { err: marshalErrorLike(err) });
                    });
                    apiRoll.chargeAmount = chargeAmount;
                }
            });
        } else if (ctx.ip) {
            const apiRoll = await this.rateLimitControl.simpleRpcIPBasedLimit(rpcReflect, ctx.ip, [rpcReflect.name.toUpperCase()],
                [
                    // 3 requests per minute
                    new Date(Date.now() - 60 * 1000), 3
                ]
            );

            rpcReflect.finally(() => {
                // if (crawlerOptions.tokenBudget && chargeAmount > crawlerOptions.tokenBudget) {
                //     return;
                // }
                if (chargeAmount) {
                    apiRoll._ref?.set({
                        chargeAmount,
                    }, { merge: true }).catch((err) => this.logger.warn(`Failed to log charge amount in apiRoll`, { err }));
                }
            });
        } else {
            this.logger.warn(`No uid or ip found for ${rpcReflect.name}`);
        }

        try {
            const r = await func(rpcReflect.input);

            chargeAmount = _.get(r, 'usage.totalTokens') || 0;
            
            return r;
        } catch (err: any) {
            if (typeof err === 'object' && err.name === 'ZodError') {
                const issue0 = err.issues[0];
                throw new ParamValidationError({
                    message: issue0.message,
                    path: issue0.path,
                });
            }
            throw err;
        }
    }
}
