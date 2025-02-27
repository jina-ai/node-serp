import 'reflect-metadata';
import path from 'path';
import fs from 'fs';

import http2 from 'http2';
import type { Server as Http1Server } from 'http';

import { KoaServer } from 'civkit/civ-rpc/koa';
import { mimeOfExt } from 'civkit/mime';
import { FsWalk, WalkOutEntity } from 'civkit/fswalk';

import { container, singleton } from 'tsyringe';
import { GlobalLogger } from './lib/logger';
import { RPCRegistry } from './lib/registry';

import type { Context, Next } from 'koa';
import { Finalizer } from './lib/finalizer';
import { FuncHost } from './api/func';

@singleton()
export class SerpServer extends KoaServer {

    logger = this.globalLogger.child({ service: this.constructor.name });
    assets = new Map<string, WalkOutEntity>();

    httpAlternativeServer?: typeof this['httpServer'];

    constructor(
        protected globalLogger: GlobalLogger,
        protected registry: RPCRegistry,
        protected funcHost: FuncHost
    ) {
        super(...arguments);
    }

    override async init() {
        const pw = this.walkForAssets();
        await this.dependencyReady();
        await super.init();
        await pw;

        this.emit('ready');
    }

    h2c() {
        this.httpAlternativeServer = this.httpServer;
        this.httpServer = http2.createServer(this.koaApp.callback());
        // useResourceBasedDefaultTracker();

        return this;
    }

    override listen(port: number) {
        const r = super.listen(port);
        if (this.httpAlternativeServer) {
            const altPort = port + 1;
            this.httpAlternativeServer.listen(altPort, () => {
                this.logger.info(`Alternative ${this.httpAlternativeServer!.constructor.name} listening on port ${altPort}`);
            });
        }

        return r;
    }

    async walkForAssets() {
        const files = await FsWalk.walkOut(path.resolve(__dirname, '..', 'public'));

        for (const file of files) {
            if (file.type !== 'file') {
                continue;
            }
            this.assets.set(file.relativePath.toString(), file);
        }
    }

    makeAssetsServingController() {
        return (ctx: Context, next: Next) => {
            const requestPath = ctx.path;
            const file = requestPath.slice(1);
            if (!file) {
                return next();
            }

            const asset = this.assets.get(file);
            if (asset?.type !== 'file') {
                return next();
            }

            ctx.body = fs.createReadStream(asset.path);
            ctx.type = mimeOfExt(path.extname(asset.path.toString())) || 'application/octet-stream';
            ctx.set('Content-Length', asset.stats.size.toString());

            return;
        };
    }

    registerRoutes(): void {
        this.koaApp.use(this.makeAssetsServingController());
        this.koaApp.use(this.registry.makeShimController());
    }

    @Finalizer()
    override async standDown() {
        const tasks: Promise<any>[] = [];
        if (this.httpAlternativeServer) {
            (this.httpAlternativeServer as Http1Server).closeIdleConnections?.();
            this.httpAlternativeServer.close();
            tasks.push(new Promise<void>((resolve, reject) => {
                this.httpAlternativeServer!.close((err) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            }));
        }
        tasks.push(super.standDown());
        await Promise.all(tasks);
    }

}

const instance = container.resolve(SerpServer);

export default instance;
