-- Inventory counts cannot go below zero.
-- Prisma cannot express CHECK constraints in schema.prisma, so it lives here.
ALTER TABLE "InventoryItem"
    ADD CONSTRAINT "InventoryItem_quantity_non_negative" CHECK ("quantity" >= 0);
