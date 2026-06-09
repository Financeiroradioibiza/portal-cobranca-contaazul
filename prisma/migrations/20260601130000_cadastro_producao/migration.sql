-- CreateEnum
CREATE TYPE "ProducaoPlayerStatus" AS ENUM ('Ativo', 'Inativo');

-- CreateTable
CREATE TABLE "cadastro_producao_layout" (
    "year_month" INTEGER NOT NULL,
    "cliente_nomes" JSONB NOT NULL DEFAULT '{}',
    "pdv_placements" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadastro_producao_layout_pkey" PRIMARY KEY ("year_month")
);

-- CreateTable
CREATE TABLE "producao_pdv_cadastro" (
    "rio_pdv_key" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "programacao_musical" VARCHAR(120) NOT NULL DEFAULT 'Padrão',
    "cep" VARCHAR(16) NOT NULL DEFAULT '',
    "endereco" TEXT NOT NULL DEFAULT '',
    "numero" VARCHAR(32) NOT NULL DEFAULT '',
    "complemento" VARCHAR(120) NOT NULL DEFAULT '',
    "bairro" VARCHAR(120) NOT NULL DEFAULT '',
    "estado" VARCHAR(8) NOT NULL DEFAULT '',
    "cidade" VARCHAR(120) NOT NULL DEFAULT '',
    "razao_social" TEXT NOT NULL DEFAULT '',
    "cnpj" VARCHAR(64) NOT NULL DEFAULT '',
    "placa_carro" BOOLEAN NOT NULL DEFAULT false,
    "controlar_player" BOOLEAN NOT NULL DEFAULT false,
    "controlar_playlist" BOOLEAN NOT NULL DEFAULT false,
    "status_player" "ProducaoPlayerStatus" NOT NULL DEFAULT 'Ativo',
    "contato_loja_nome" TEXT NOT NULL DEFAULT '',
    "contato_loja_email" TEXT NOT NULL DEFAULT '',
    "contato_loja_telefone" VARCHAR(64) NOT NULL DEFAULT '',
    "contato_cobranca_nome" TEXT NOT NULL DEFAULT '',
    "contato_cobranca_email" TEXT NOT NULL DEFAULT '',
    "contato_cobranca_telefone" VARCHAR(64) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producao_pdv_cadastro_pkey" PRIMARY KEY ("rio_pdv_key")
);
