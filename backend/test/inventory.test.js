const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InventoryItem, InventoryService, PrismaInventoryRepository } = require('../src/inventory');
const { createApp } = require('../src/app');

test('GET /api/categories returns categories through the service', async () => {
    const categories = [{ id: 'category-1', name: 'Sensors' }];
    const service = new InventoryService({
        async listCategories() { return categories; },
    });
    const server = createApp(service).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/categories`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), categories);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('domain rejects invalid quantities and names', () => {
    const invalidQuantities = [-2147483649, 1.2, '4', null, NaN, Infinity, 2147483648];

    for (const quantity of invalidQuantities) {
        assert.throws(() => {
            new InventoryItem('Filament', quantity);
        });
    }

    const invalidNames = ['', '  ', null];

    for (const name of invalidNames) {
        assert.throws(() => {
            new InventoryItem(name, 0);
        });
    }

    const item = new InventoryItem(' PLA spool ', 0);

    assert.equal(item.name, 'PLA spool');
    assert.equal(item.quantity, 0);
});

test('service validates before calling repository', () => {
    const repository = {
        setQuantity() {
            assert.fail('must not persist invalid values');
        },
    };
    const service = new InventoryService(repository);

    assert.throws(() => {
        service.setQuantity('id', { quantity: 1.5, version: 0 });
    });

    assert.throws(() => {
        service.setQuantity('id', { quantity: 1 });
    });
});

test('HTTP reports invalid JSON and quantities as 400', async () => {
    const repository = {};
    const service = new InventoryService(repository);
    const app = createApp(service);
    const server = app.listen(0, '127.0.0.1');

    await new Promise((resolve) => {
        server.once('listening', resolve);
    });

    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/api/items`;
    const invalidItem = { name: 'Test', quantity: 1.5 };
    const invalidBodies = ['{', JSON.stringify(invalidItem)];

    try {
        for (const body of invalidBodies) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
            });
            const responseData = await response.json();

            assert.equal(response.status, 400);
            assert.ok(responseData.error);
        }
    } finally {
        await new Promise((resolve) => {
            server.close(resolve);
        });
    }
});

test('service creates an item and sets an absolute quantity through its repository', async () => {
    const calls = [];
    const repository = {
        async create(item) {
            calls.push(['create', item]);

            return {
                id: 'item-1',
                name: item.name,
                quantity: item.quantity,
                version: 0,
            };
        },

        async setQuantity(id, quantity, version) {
            calls.push(['set', id, quantity, version]);

            return {
                id: id,
                name: 'PLA spool',
                quantity: quantity,
                version: version + 1,
            };
        },
    };
    const service = new InventoryService(repository);
    const item = await service.create({ name: ' PLA spool ', quantity: -4 });

    assert.equal(item.name, 'PLA spool');
    assert.equal(item.quantity, -4);

    const updatedItem = await service.setQuantity(item.id, {
        quantity: -2,
        version: item.version,
    });

    assert.equal(updatedItem.quantity, -2);
    assert.equal(updatedItem.version, 1);
    assert.deepEqual(calls[1], ['set', 'item-1', -2, 0]);
});

test('item names have no application length limit', () => {
    const longName = 'a'.repeat(10000);
    const longNameItem = new InventoryItem(longName, 0);
    const singleCharacterItem = new InventoryItem('x', 0);

    assert.equal(longNameItem.name, longName);
    assert.equal(singleCharacterItem.name, 'x');
});

test('category selections are validated, deduplicated, and optional', async () => {
    const calls = [];
    const service = new InventoryService({
        create(item, ids) { calls.push(ids); return item; },
    });
    for (const categoryIds of ['id', [null], [''], [42]]) {
        assert.throws(() => service.create({ name: 'Board', quantity: 1, categoryIds }));
    }
    assert.equal(calls.length, 0);
    await service.create({ name: 'Board', quantity: 1, categoryIds: ['a', 'b', 'a'] });
    await service.create({ name: 'Board', quantity: 1 });
    assert.deepEqual(calls, [['a', 'b'], []]);
});

test('repository connects categories and translates missing category errors', async () => {
    let data;
    const repository = new PrismaInventoryRepository({ inventoryItem: {
        async create(query) { data = query.data; return data; },
    } });
    await repository.create(new InventoryItem('Board', 1), ['a', 'b']);
    assert.deepEqual(data.categories.connect, [{ id: 'a' }, { id: 'b' }]);

    const failing = new PrismaInventoryRepository({ inventoryItem: {
        async create() { throw Object.assign(new Error('Missing'), { code: 'P2025' }); },
    } });
    await assert.rejects(failing.create(new InventoryItem('Board', 1), ['gone']),
        (error) => error.status === 400 && error.message.includes('category no longer exists'));
});


test('editing validates name, categories, and version before persisting', () => {
    const calls = [];
    const service = new InventoryService({
        edit(...args) { calls.push(args); return args; },
    });
    const valid = { name: ' Board ', categoryIds: ['a', 'a', 'b'], version: 2 };
    for (const invalid of [
        { name: ' ' }, { categoryIds: undefined }, { categoryIds: [null] },
        { categoryIds: ['  '] }, { version: -1 }, { version: 1.5 }, { version: undefined },
    ]) {
        assert.throws(() => service.edit('item-1', { ...valid, ...invalid }));
    }
    assert.equal(calls.length, 0);
    service.edit('item-1', valid);
    service.edit('item-1', { ...valid, categoryIds: [] });
    assert.deepEqual(calls, [
        ['item-1', 'Board', ['a', 'b'], 2], ['item-1', 'Board', [], 2],
    ]);
});

test('edit endpoint returns the updated item and rejects invalid input', async () => {
    const service = new InventoryService({
        edit(id, name, categoryIds, version) {
            return { id, name, categories: categoryIds.map((id) => ({ id, name: 'Sensors' })),
                quantity: 9, version: version + 1 };
        },
    });
    const server = createApp(service).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/api/items/item-1`;
        const send = (body) => fetch(url, { method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const response = await send({ name: ' New board ', categoryIds: ['a'], version: 0 });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { id: 'item-1', name: 'New board',
            categories: [{ id: 'a', name: 'Sensors' }], quantity: 9, version: 1 });
        assert.equal((await send({ name: ' ' })).status, 400);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('repository edits replace categories without writing quantity and check the item version', async () => {
    const calls = [];
    const saved = { id: 'item-1', name: 'Board', quantity: 9, categories: [] };
    const transaction = { inventoryItem: {
        async updateMany(query) { calls.push(query); return { count: 1 }; },
        async update(query) { calls.push(query); return saved; },
    } };
    const repository = new PrismaInventoryRepository({ $transaction: (run) => run(transaction) });
    assert.equal(await repository.edit('item-1', 'Board', ['a'], 2), saved);
    assert.deepEqual(calls[0], { where: { id: 'item-1', version: 2 },
        data: { name: 'Board', version: { increment: 1 } } });
    assert.deepEqual(calls[1].data, { categories: { set: [], connect: [{ id: 'a' }] } });
    await repository.edit('item-1', 'Board', [], 3);
    assert.deepEqual(calls[3].data, { categories: { set: [], connect: [] } });

    transaction.inventoryItem.updateMany = async () => ({ count: 0 });
    transaction.inventoryItem.findUnique = async () => saved;
    await assert.rejects(repository.edit('item-1', 'Board', [], 0), (error) => error.status === 409);
    transaction.inventoryItem.findUnique = async () => null;
    await assert.rejects(repository.edit('gone', 'Board', [], 0), (error) => error.status === 404);

    transaction.inventoryItem.updateMany = async () => ({ count: 1 });
    transaction.inventoryItem.update = async () => {
        throw Object.assign(new Error('Missing'), { code: 'P2025' });
    };
    await assert.rejects(repository.edit('item-1', 'Board', ['gone'], 2),
        (error) => error.status === 400 && error.message.includes('category no longer exists'));
});
