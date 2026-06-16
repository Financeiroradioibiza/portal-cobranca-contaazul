-- AlterTable
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "cliente_nome" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "cep" VARCHAR(12) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "endereco" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "numero" VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "complemento" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "bairro" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "cidade" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "uf" VARCHAR(2) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "contato_loja_nome" VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "contato_loja_whatsapp" VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "contato_loja_email" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "contato_cobranca_nome" VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "contato_cobranca_email" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "contato_cobranca_tel" VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE "pedido_cliente_pdv" ADD COLUMN "rio_pdv_id" VARCHAR(64);
