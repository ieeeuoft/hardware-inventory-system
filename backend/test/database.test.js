// Opt in against your local test database: RUN_DATABASE_TESTS=1 node --test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { InventoryService, PrismaInventoryRepository } = require('../src/inventory');
const { createApp } = require('../src/app');

const databaseTestOptions = {
    skip: process.env.RUN_DATABASE_TESTS !== '1',
};

test('PostgreSQL API persists counts, accepts zero, and rejects stale concurrent writes', databaseTestOptions, async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaInventoryRepository(prisma);
    const service = new InventoryService(repository);
    const app = createApp(service);
    const server = app.listen(0, '127.0.0.1');

    await new Promise((resolve) => {
        server.once('listening', resolve);
    });

    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/items`;

    function send(url, method, body) {
        return fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    let itemId;

    try {
        const createResponse = await send(baseUrl, 'POST', {
            name: 'Integration test spool',
            quantity: 5,
        });

        assert.equal(createResponse.status, 201);

        const createdItem = await createResponse.json();
        itemId = createdItem.id;
        const quantityUrl = `${baseUrl}/${itemId}/quantity`;

        const firstUpdate = send(quantityUrl, 'PATCH', { quantity: 7, version: 0 });
        const secondUpdate = send(quantityUrl, 'PATCH', { quantity: 8, version: 0 });
        const responses = await Promise.all([firstUpdate, secondUpdate]);
        const responseStatuses = responses.map((response) => {
            return response.status;
        });
        responseStatuses.sort();

        assert.deepEqual(responseStatuses, [200, 409]);

        const savedItem = await prisma.inventoryItem.findUnique({
            where: { id: itemId },
        });

        assert.equal(savedItem.version, 1);

        const zeroResponse = await send(quantityUrl, 'PATCH', { quantity: 0, version: 1 });

        assert.equal(zeroResponse.status, 200);

        const freshClient = new PrismaClient();

        try {
            const persistedItem = await freshClient.inventoryItem.findUnique({
                where: { id: itemId },
            });

            assert.equal(persistedItem.quantity, 0);
        } finally {
            await freshClient.$disconnect();
        }

        const listResponse = await fetch(baseUrl);
        const listedItems = await listResponse.json();
        const includesUpdatedItem = listedItems.some((item) => {
            return item.id === itemId && item.quantity === 0;
        });

        assert.ok(includesUpdatedItem);

        const negativeResponse = await send(quantityUrl, 'PATCH', { quantity: -3, version: 2 });

        assert.equal(negativeResponse.status, 200);

        const negativeQuantityItem = await prisma.inventoryItem.findUnique({
            where: { id: itemId },
        });

        assert.equal(negativeQuantityItem.quantity, -3);

        const missingItemUrl = `${baseUrl}/missing/quantity`;
        const missingItemResponse = await send(missingItemUrl, 'PATCH', {
            quantity: 1,
            version: 0,
        });

        assert.equal(missingItemResponse.status, 404);
    } finally {
        if (itemId !== undefined) {
            await prisma.inventoryItem.delete({ where: { id: itemId } });
        }

        await new Promise((resolve) => {
            server.close(resolve);
        });

        await prisma.$disconnect();
    }
});
