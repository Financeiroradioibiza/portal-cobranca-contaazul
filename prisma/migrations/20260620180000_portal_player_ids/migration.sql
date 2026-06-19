-- IDs do Player no portal (substituem painel legado como referência operacional).

ALTER TABLE "rio_comp_cliente_linha" ADD COLUMN IF NOT EXISTS "portal_cliente_id" INTEGER;
ALTER TABLE "rio_comp_pdv" ADD COLUMN IF NOT EXISTS "portal_pdv_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "rio_comp_cliente_linha_portal_cliente_id_key"
  ON "rio_comp_cliente_linha"("portal_cliente_id");
CREATE UNIQUE INDEX IF NOT EXISTS "rio_comp_pdv_portal_pdv_id_key"
  ON "rio_comp_pdv"("portal_pdv_id");

CREATE TABLE IF NOT EXISTS "cliente_player_login" (
  "id" TEXT NOT NULL,
  "portal_cliente_id" INTEGER NOT NULL,
  "email" VARCHAR(200) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "cliente_nome" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cliente_player_login_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cliente_player_login_portal_cliente_id_key"
  ON "cliente_player_login"("portal_cliente_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cliente_player_login_email_key"
  ON "cliente_player_login"("email");
