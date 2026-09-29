-- CreateTable
CREATE TABLE "rela_cliente_contato_relacionamento" (
    "cliente_key" VARCHAR(120) NOT NULL,
    "nome" VARCHAR(200) NOT NULL DEFAULT '',
    "whatsapp" VARCHAR(40) NOT NULL DEFAULT '',
    "email" VARCHAR(200) NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rela_cliente_contato_relacionamento_pkey" PRIMARY KEY ("cliente_key")
);
