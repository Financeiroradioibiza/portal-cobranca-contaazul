-- Um PDV do painel legado só pode estar vinculado a um PDV Rio.
DELETE FROM "painel_pdv_link"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("painel_pdv_id") "id"
  FROM "painel_pdv_link"
  ORDER BY "painel_pdv_id", "created_at" ASC
);

DROP INDEX IF EXISTS "painel_pdv_link_painel_pdv_id_idx";

CREATE UNIQUE INDEX "painel_pdv_link_painel_pdv_id_key" ON "painel_pdv_link"("painel_pdv_id");
