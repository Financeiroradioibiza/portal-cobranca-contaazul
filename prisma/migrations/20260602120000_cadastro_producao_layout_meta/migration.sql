-- AlterTable
ALTER TABLE "cadastro_producao_layout" ADD COLUMN "hidden_cliente_keys" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "cadastro_producao_layout" ADD COLUMN "custom_clientes" JSONB NOT NULL DEFAULT '[]';
