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

    listCategories() {
        return this.prisma.category.findMany({
            select: { id: true, name: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
    }

    list() {
        return this.prisma.inventoryItem.findMany({
            include: { categories: { select: { id: true, name: true } } }, 
            orderBy: [
                { name: 'asc' },
                { id: 'asc' },
            ],
        });
    }

    async create(item, categoryIds = []) {
        try {
            return await this.prisma.inventoryItem.create({
                data: {
                    name: item.name,
                    quantity: item.quantity,
                    //look up each category id and connect them in the cat/inv item join table
                    categories: { connect: categoryIds.map((categoryId) => ({ id: categoryId })) },
                    // connect: [{ id: 'cat_1' }, { id: 'cat_2' }]
                },
                include: { categories: { select: { id: true, name: true } } },
            });
        } catch (error) {
            if (error.code === 'P2025') { // if prisma cant find the category record AKA row
                throw new InventoryError('A selected category no longer exists. Reopen the form and try again.');
            }
            throw error;
        }
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
                include: { categories: { select: { id: true, name: true } } }, 
            });

            return updatedItem;
        });
    }
}

class InventoryService {
    constructor(repository) {
        this.repository = repository;
    }

    listCategories() {
        return this.repository.listCategories();
    }

    list() {
        return this.repository.list();
    }

    create(itemData = {}) {
        const item = new InventoryItem(itemData.name, itemData.quantity);
        const categoryIds = itemData.categoryIds ?? [];
        if (!Array.isArray(categoryIds) || categoryIds.some((id) => typeof id !== 'string' || !id.trim())) {
            throw new InventoryError('Category IDs must be an array of non-empty strings.');
        }
        return this.repository.create(item, [...new Set(categoryIds)]);
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
