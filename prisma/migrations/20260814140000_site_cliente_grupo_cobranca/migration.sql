-- Grupo site cliente: tipo produção (default) vs cobrança + escopo CA (ponte segura).

ALTER TABLE "site_cliente_grupo"
  ADD COLUMN "tipo" VARCHAR(20) NOT NULL DEFAULT 'producao';

CREATE TABLE "site_cliente_grupo_ca_cliente" (
  "id" TEXT NOT NULL,
  "grupo_id" TEXT NOT NULL,
  "ca_person_id" VARCHAR(120) NOT NULL,
  "documento" VARCHAR(64),
  "razao_social" TEXT NOT NULL DEFAULT '',
  "nome_fantasia" TEXT NOT NULL DEFAULT '',
  "email_cobranca" TEXT,
  "rio_linha_id" VARCHAR(80),

  CONSTRAINT "site_cliente_grupo_ca_cliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_cliente_grupo_ca_cliente_grupo_id_ca_person_id_key"
  ON "site_cliente_grupo_ca_cliente"("grupo_id", "ca_person_id");

CREATE INDEX "site_cliente_grupo_ca_cliente_grupo_id_idx"
  ON "site_cliente_grupo_ca_cliente"("grupo_id");

ALTER TABLE "site_cliente_grupo_ca_cliente"
  ADD CONSTRAINT "site_cliente_grupo_ca_cliente_grupo_id_fkey"
  FOREIGN KEY ("grupo_id") REFERENCES "site_cliente_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
