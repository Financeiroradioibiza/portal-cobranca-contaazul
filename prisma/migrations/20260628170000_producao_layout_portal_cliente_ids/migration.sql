-- IDs de cliente Player (100+) por bucket da produção musical (ex.: custom:hering), não por linha Rio.

ALTER TABLE "cadastro_producao_layout"
  ADD COLUMN IF NOT EXISTS "portal_cliente_ids_by_bucket_key" JSONB NOT NULL DEFAULT '{}';
