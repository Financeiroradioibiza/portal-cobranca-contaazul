-- Template cliente novo: sequência, prazos, status aguardando
ALTER TYPE "ChamadoStatus" ADD VALUE 'aguardando';

ALTER TABLE "chamado" ADD COLUMN "prazo_entrega" TIMESTAMP(3);
ALTER TABLE "chamado" ADD COLUMN "template_kind" VARCHAR(32);
ALTER TABLE "chamado" ADD COLUMN "sequencia_grupo_id" VARCHAR(64);
ALTER TABLE "chamado" ADD COLUMN "sequencia_passo" INTEGER;
ALTER TABLE "chamado" ADD COLUMN "sequencia_total" INTEGER;
ALTER TABLE "chamado" ADD COLUMN "sequencia_rotulo" VARCHAR(120);

CREATE INDEX "chamado_prazo_entrega_idx" ON "chamado"("prazo_entrega");
CREATE INDEX "chamado_sequencia_grupo_id_idx" ON "chamado"("sequencia_grupo_id");
