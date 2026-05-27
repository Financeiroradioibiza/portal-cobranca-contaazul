-- Coluna «Arquivo»: marcar envio mensal da listagem de clientes (mês anterior) + anexo em BYTEA por linha/mês.

ALTER TABLE "manual_reminder_template" ADD COLUMN "anexar_listagem_clientes_oc" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "manual_reminder_row" ADD COLUMN "anexar_listagem_clientes_oc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "manual_reminder_row" ADD COLUMN "listagem_cliente_arquivo" BYTEA;
ALTER TABLE "manual_reminder_row" ADD COLUMN "listagem_cliente_arquivo_nome" VARCHAR(480);
ALTER TABLE "manual_reminder_row" ADD COLUMN "listagem_cliente_arquivo_mime" VARCHAR(160);
