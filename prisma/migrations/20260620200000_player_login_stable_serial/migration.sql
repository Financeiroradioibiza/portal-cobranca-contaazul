ALTER TABLE "cliente_player_login" ADD COLUMN IF NOT EXISTS "password_plain" VARCHAR(64);

ALTER TABLE "producao_pdv_cadastro" ADD COLUMN IF NOT EXISTS "player_instalacao_token" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "producao_pdv_cadastro" ADD COLUMN IF NOT EXISTS "player_instalado_em" TIMESTAMP(3);
