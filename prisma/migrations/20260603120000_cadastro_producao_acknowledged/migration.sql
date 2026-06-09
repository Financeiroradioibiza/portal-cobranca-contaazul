-- PDVs novos (entrada) já organizados na produção
ALTER TABLE "cadastro_producao_layout" ADD COLUMN "acknowledged_pdvs" JSONB NOT NULL DEFAULT '[]';
