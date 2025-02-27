import 'reflect-metadata';

import server from './server';

server.serviceReady().then((s) => s.listen(parseInt(process.env.PORT || '') || 3000));

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection', err);
});

process.on('uncaughtException', (err) => {
    console.log('Uncaught exception', err);

    process.nextTick(() => process.exit(1));
    console.error('Uncaught exception, process quit.');
    throw err;
});
