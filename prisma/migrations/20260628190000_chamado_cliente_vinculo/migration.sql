-- Vínculo opcional de chamado com cliente/PDV da produção
ALTER TABLE "chamado" ADD COLUMN IF NOT EXISTS "rio_linha_id" VARCHAR(64);
ALTER TABLE "chamado" ADD COLUMN IF NOT EXISTS "rio_pdv_key" VARCHAR(120);
ALTER TABLE "chamado" ADD COLUMN IF NOT EXISTS "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "chamado_rio_linha_id_idx" ON "chamado"("rio_linha_id");
CREATE INDEX IF NOT EXISTS "chamado_rio_pdv_key_idx" ON "chamado"("rio_pdv_key");
