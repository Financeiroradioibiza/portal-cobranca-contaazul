-- AlterTable
ALTER TABLE "player_aviso_operador" ADD COLUMN "batch_id" TEXT;

-- CreateIndex
CREATE INDEX "player_aviso_operador_batch_id_idx" ON "player_aviso_operador"("batch_id");
