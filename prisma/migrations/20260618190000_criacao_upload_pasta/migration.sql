-- Destino de upload: pasta/programação escolhida no portal
ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "programacao_id" TEXT;
ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "pasta_id" TEXT;
