'use strict';

class InventoryError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

class InventoryItem {
    static validateQuantity(quantity) {
        const isInteger = Number.isInteger(quantity);
        const isWithinDatabaseRange = quantity >= -2147483648 && quantity <= 2147483647;

        if (!isInteger || !isWithinDatabaseRange) {
            throw new InventoryError(
                'Quantity must be a whole number from -2,147,483,648 to 2,147,483,647.'
            );
        }

        return quantity;
    }

    constructor(name, quantity) {
        if (typeof name !== 'string') {
            throw new InventoryError('Item name must contain at least one non-whitespace character.');
        }

        const trimmedName = name.trim();

        if (trimmedName.length === 0) {
            throw new InventoryError('Item name must contain at least one non-whitespace character.');
        }

        InventoryItem.validateQuantity(quantity);

        this.name = trimmedName;
        this.quantity = quantity;
    }
}

class PrismaInventoryRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    list() {
        return this.prisma.inventoryItem.findMany({
            orderBy: [
                { name: 'asc' },
                { id: 'asc' },
            ],
        });
    }

    create(item) {
        return this.prisma.inventoryItem.create({
            data: {
                name: item.name,
                quantity: item.quantity,
            },
        });
    }

    async setQuantity(id, quantity, version) {
        return this.prisma.$transaction(async (transaction) => {
            const updateResult = await transaction.inventoryItem.updateMany({
                where: {
                    id: id,
                    version: version,
                },
                data: {
                    quantity: quantity,
                    version: {
                        increment: 1,
                    },
                },
            });

            if (updateResult.count === 0) {
                const existingItem = await transaction.inventoryItem.findUnique({
                    where: { id: id },
                });

                if (existingItem === null) {
                    throw new InventoryError('Item not found.', 404);
                }

                throw new InventoryError(
                    'This item changed since you opened it. Refresh the inventory and try again.',
                    409
                );
            }

            const updatedItem = await transaction.inventoryItem.findUnique({
                where: { id: id },
            });

            return updatedItem;
        });
    }
}

class InventoryService {
    constructor(repository) {
        this.repository = repository;
    }

    list() {
        return this.repository.list();
    }

    create(itemData = {}) {
        const item = new InventoryItem(itemData.name, itemData.quantity);

        return this.repository.create(item);
    }

    setQuantity(id, itemData = {}) {
        const quantity = itemData.quantity;
        const version = itemData.version;

        InventoryItem.validateQuantity(quantity);

        const isIntegerVersion = Number.isInteger(version);
        const isValidVersionRange = version >= 0 && version < 2147483647;

        if (!isIntegerVersion || !isValidVersionRange) {
            throw new InventoryError('A valid item version is required. Refresh the inventory.');
        }

        return this.repository.setQuantity(id, quantity, version);
    }
}

module.exports = {
    InventoryError,
    InventoryItem,
    InventoryService,
    PrismaInventoryRepository,
};
