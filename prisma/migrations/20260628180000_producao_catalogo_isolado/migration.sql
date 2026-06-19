-- Catálogo operacional singleton (year_month = 0) + IDs Player só no layout.
-- Rio permanece porto seguro: produção/player não escrevem mais em rio_comp_*.

ALTER TABLE "cadastro_producao_layout"
  ADD COLUMN IF NOT EXISTS "portal_pdv_ids_by_rio_pdv_key" JSONB NOT NULL DEFAULT '{}';

-- Fonte Rio pinada (espelho de leitura) — só muda por ação explícita no portal_config.
INSERT INTO "portal_config" ("chave", "valor", "updated_by", "updated_at")
SELECT
  'producao.rio_source_ym',
  COALESCE(
    (SELECT MAX("year_month")::text FROM "cadastro_producao_layout" WHERE "year_month" > 0),
    (SELECT MAX("year_month")::text FROM "rio_comp_month"),
    '202606'
  ),
  'migration',
  NOW()
ON CONFLICT ("chave") DO NOTHING;

-- Consolida o layout editorial mais completo em year_month = 0.
WITH best AS (
  SELECT "year_month"
  FROM "cadastro_producao_layout"
  WHERE "year_month" > 0
  ORDER BY
    jsonb_array_length(COALESCE("pdv_placements", '[]'::jsonb))
    + jsonb_array_length(COALESCE("custom_clientes", '[]'::jsonb))
    DESC,
    "year_month" DESC
  LIMIT 1
),
src AS (
  SELECT l.*
  FROM "cadastro_producao_layout" l
  WHERE l."year_month" = COALESCE((SELECT "year_month" FROM best), 0)
)
INSERT INTO "cadastro_producao_layout" (
  "year_month",
  "cliente_nomes",
  "pdv_placements",
  "hidden_cliente_keys",
  "custom_clientes",
  "acknowledged_pdvs",
  "movimento_baseline_entrada_ids",
  "movimento_baseline_saida_ids",
  "movimento_organized_at",
  "portal_cliente_ids_by_bucket_key",
  "portal_pdv_ids_by_rio_pdv_key",
  "updated_at"
)
SELECT
  0,
  s."cliente_nomes",
  s."pdv_placements",
  s."hidden_cliente_keys",
  s."custom_clientes",
  s."acknowledged_pdvs",
  s."movimento_baseline_entrada_ids",
  s."movimento_baseline_saida_ids",
  s."movimento_organized_at",
  s."portal_cliente_ids_by_bucket_key",
  '{}'::jsonb,
  NOW()
FROM src s
WHERE EXISTS (SELECT 1 FROM src)
ON CONFLICT ("year_month") DO UPDATE SET
  "cliente_nomes" = EXCLUDED."cliente_nomes",
  "pdv_placements" = EXCLUDED."pdv_placements",
  "hidden_cliente_keys" = EXCLUDED."hidden_cliente_keys",
  "custom_clientes" = EXCLUDED."custom_clientes",
  "acknowledged_pdvs" = EXCLUDED."acknowledged_pdvs",
  "movimento_baseline_entrada_ids" = EXCLUDED."movimento_baseline_entrada_ids",
  "movimento_baseline_saida_ids" = EXCLUDED."movimento_baseline_saida_ids",
  "movimento_organized_at" = EXCLUDED."movimento_organized_at",
  "portal_cliente_ids_by_bucket_key" = CASE
    WHEN "cadastro_producao_layout"."portal_cliente_ids_by_bucket_key" = '{}'::jsonb
      THEN EXCLUDED."portal_cliente_ids_by_bucket_key"
    ELSE "cadastro_producao_layout"."portal_cliente_ids_by_bucket_key"
  END,
  "updated_at" = NOW();

-- Copia IDs de PDV já existentes na Rio (referência legada) para o layout operacional.
WITH src_ym AS (
  SELECT COALESCE(
    NULLIF((SELECT "valor" FROM "portal_config" WHERE "chave" = 'producao.rio_source_ym'), '')::int,
    (SELECT MAX("year_month") FROM "rio_comp_month")
  ) AS ym
),
pdv_map AS (
  SELECT COALESCE(
    jsonb_object_agg(p."id", to_jsonb(p."portal_pdv_id")),
    '{}'::jsonb
  ) AS j
  FROM "rio_comp_pdv" p
  INNER JOIN "rio_comp_cliente_linha" l ON l."id" = p."cliente_id"
  INNER JOIN "rio_comp_month" m ON m."id" = l."month_id"
  CROSS JOIN src_ym s
  WHERE m."year_month" = s.ym
    AND p."portal_pdv_id" IS NOT NULL
)
UPDATE "cadastro_producao_layout" c
SET
  "portal_pdv_ids_by_rio_pdv_key" = c."portal_pdv_ids_by_rio_pdv_key" || (SELECT j FROM pdv_map),
  "updated_at" = NOW()
WHERE c."year_month" = 0
  AND EXISTS (SELECT 1 FROM pdv_map WHERE j <> '{}'::jsonb);
