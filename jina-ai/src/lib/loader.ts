import { container } from 'tsyringe';
import { readdirSync } from 'fs';
import _ from 'lodash';
import { AsyncService } from 'civkit/async-service';

export function loadModulesDynamically(path: string) {
    const moduleDir = readdirSync(path,
        { withFileTypes: true, encoding: 'utf-8' });

    const modules = moduleDir.filter((x) => x.isFile() && x.name.endsWith('.js')).map((x) => x.name);

    const apiClasses: { [k: string]: any; } = {};

    for (const m of modules) {
        try {
            if (m === 'index.js') {
                continue;
            }

            // FIXME: Does not work with esm
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(`${path}/${m}`);

            for (const [k, v] of Object.entries<Function>(mod)) {
                if (v?.prototype instanceof AsyncService) {

                    const name = k.split(/(api)?host/i).shift();

                    apiClasses[_.camelCase(name)] = container.resolve(v as any);
                }
            }
        } catch (err) {
            // ignore
            console.warn(`Failed to load module ${m}`, err);
        }
    }

    return apiClasses;
}


export function loadClassesDynamically<T extends abstract new (...args: any[]) => any>(path: string, baseClass: T) {
    const moduleDir = readdirSync(path,
        { withFileTypes: true, encoding: 'utf-8' });

    const modules = moduleDir.filter((x) => x.isFile() && x.name.endsWith('.js')).map((x) => x.name);

    const classes: {
        [k: string]: T;
    } = {};

    for (const m of modules) {
        try {
            if (m === 'index.js') {
                continue;
            }

            // FIXME: Does not work with esm
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(`${path}/${m}`);

            for (const [k, v] of Object.entries(mod)) {
                if (v instanceof baseClass.constructor) {
                    classes[k === 'default' ? m : k] = v as any;
                }
            }
        } catch (err) {
            // ignore
            console.warn(`Failed to load module ${m}`, err);
        }
    }

    return classes;
}
