'use strict';

const express = require('express');
const { InventoryError } = require('./inventory');

function createApp(service) {
    const app = express();
    const jsonParser = express.json({ limit: '16kb' });

    app.use(jsonParser);

    app.get('/', (request, response) => {
        response.send('Hello World!');
    });

    app.get('/api/items', async (request, response) => {
        const items = await service.list();

        response.json(items);
    });

    app.post('/api/items', async (request, response) => {
        let itemData = request.body;

        if (itemData === undefined || itemData === null) {
            itemData = {};
        }

        const createdItem = await service.create(itemData);

        response.status(201).json(createdItem);
    });

    app.patch('/api/items/:id/quantity', async (request, response) => {
        const itemId = request.params.id;
        let itemData = request.body;

        if (itemData === undefined || itemData === null) {
            itemData = {};
        }

        const updatedItem = await service.setQuantity(itemId, itemData);

        response.json(updatedItem);
    });

    // Express identifies error handlers by these four parameters.
    app.use((error, request, response, next) => {
        if (error instanceof InventoryError) {
            response.status(error.status).json({ error: error.message });
            return;
        }

        if (error.type === 'entity.parse.failed') {
            response.status(400).json({ error: 'Invalid JSON body.' });
            return;
        }

        console.error(error);
        response.status(500).json({
            error: 'Could not save or load inventory. Please try again.',
        });
    });

    return app;
}

module.exports = { createApp };
