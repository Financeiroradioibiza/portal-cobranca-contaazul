-- Baseline de movimento Rio × Produção: congela entradas/saídas da organização inicial.
ALTER TABLE "cadastro_producao_layout" ADD COLUMN "movimento_baseline_entrada_ids" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "cadastro_producao_layout" ADD COLUMN "movimento_baseline_saida_ids" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "cadastro_producao_layout" ADD COLUMN "movimento_organized_at" TIMESTAMP(3);
