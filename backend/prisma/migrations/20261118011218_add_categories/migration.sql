-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CategoryToInventoryItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoryToInventoryItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "_CategoryToInventoryItem_B_index" ON "_CategoryToInventoryItem"("B");

-- AddForeignKey
ALTER TABLE "_CategoryToInventoryItem" ADD CONSTRAINT "_CategoryToInventoryItem_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToInventoryItem" ADD CONSTRAINT "_CategoryToInventoryItem_B_fkey" FOREIGN KEY ("B") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
