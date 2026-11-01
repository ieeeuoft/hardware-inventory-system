#!/usr/bin/env node
'use strict';

function getPort() {
    const args = process.argv;

    if (args.length !== 3) {
        console.error("usage: node index.js port");
        process.exit(1);
    }

    const num = parseInt(args[2], 10);
    if (isNaN(num)) {
        console.error("error: argument must be an integer.");
        process.exit(1);
    }

    return num;
}

const port = getPort();

const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./src/app');
const { InventoryService, PrismaInventoryRepository } = require('./src/inventory');

const prisma = new PrismaClient();
const repository = new PrismaInventoryRepository(prisma);
const service = new InventoryService(repository);
const app = createApp(service);

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('error', (err) => {
    console.error(`cannot start server: ${err.message}`);
    process.exit(1);
});
