-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "import_id" UUID;

-- CreateIndex
CREATE INDEX "transactions_import_id_idx" ON "transactions"("import_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
