-- Site Clientes — grupos, usuários, escopo e moodboard

CREATE TABLE IF NOT EXISTS "site_cliente_grupo" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_cliente_grupo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "site_cliente_usuario" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "telefone" VARCHAR(40) NOT NULL DEFAULT '',
    "email" VARCHAR(200) NOT NULL,
    "funcao_empresa" VARCHAR(120) NOT NULL DEFAULT '',
    "login_email" VARCHAR(200) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permissoes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_cliente_usuario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_cliente_usuario_login_email_key" ON "site_cliente_usuario"("login_email");
CREATE INDEX IF NOT EXISTS "site_cliente_usuario_grupo_id_idx" ON "site_cliente_usuario"("grupo_id");

CREATE TABLE IF NOT EXISTS "site_cliente_grupo_cliente" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "rio_linha_id" VARCHAR(80) NOT NULL,
    "portal_cliente_id" INTEGER,

    CONSTRAINT "site_cliente_grupo_cliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_cliente_grupo_cliente_grupo_id_rio_linha_id_key"
    ON "site_cliente_grupo_cliente"("grupo_id", "rio_linha_id");
CREATE INDEX IF NOT EXISTS "site_cliente_grupo_cliente_grupo_id_idx" ON "site_cliente_grupo_cliente"("grupo_id");

CREATE TABLE IF NOT EXISTS "site_cliente_grupo_pdv" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "rio_pdv_key" VARCHAR(80) NOT NULL,
    "portal_pdv_id" INTEGER,

    CONSTRAINT "site_cliente_grupo_pdv_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_cliente_grupo_pdv_grupo_id_rio_pdv_key_key"
    ON "site_cliente_grupo_pdv"("grupo_id", "rio_pdv_key");
CREATE INDEX IF NOT EXISTS "site_cliente_grupo_pdv_grupo_id_idx" ON "site_cliente_grupo_pdv"("grupo_id");

CREATE TABLE IF NOT EXISTS "site_cliente_moodboard" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "rio_linha_id" VARCHAR(80) NOT NULL,
    "portal_cliente_id" INTEGER,
    "perfil_publico" TEXT NOT NULL DEFAULT '',
    "posicionamento_marca" TEXT NOT NULL DEFAULT '',
    "estilo_musical_principal" VARCHAR(120) NOT NULL DEFAULT '',
    "objetivo_periodo" TEXT NOT NULL DEFAULT '',
    "notas_internas" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_cliente_moodboard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_cliente_moodboard_grupo_id_rio_linha_id_key"
    ON "site_cliente_moodboard"("grupo_id", "rio_linha_id");

ALTER TABLE "site_cliente_usuario" ADD CONSTRAINT "site_cliente_usuario_grupo_id_fkey"
    FOREIGN KEY ("grupo_id") REFERENCES "site_cliente_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_cliente_grupo_cliente" ADD CONSTRAINT "site_cliente_grupo_cliente_grupo_id_fkey"
    FOREIGN KEY ("grupo_id") REFERENCES "site_cliente_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_cliente_grupo_pdv" ADD CONSTRAINT "site_cliente_grupo_pdv_grupo_id_fkey"
    FOREIGN KEY ("grupo_id") REFERENCES "site_cliente_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_cliente_moodboard" ADD CONSTRAINT "site_cliente_moodboard_grupo_id_fkey"
    FOREIGN KEY ("grupo_id") REFERENCES "site_cliente_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
