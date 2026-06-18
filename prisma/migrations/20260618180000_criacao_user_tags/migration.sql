-- Tag visual por usuário (iniciais + cor) e tag criativa no upload
ALTER TABLE "portal_user" ADD COLUMN IF NOT EXISTS "tag_iniciais" VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE "portal_user" ADD COLUMN IF NOT EXISTS "tag_cor" VARCHAR(9) NOT NULL DEFAULT '#6366f1';

ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "criativo_user_id" VARCHAR(200);
ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "upload_tag_nome" VARCHAR(80) NOT NULL DEFAULT '';
