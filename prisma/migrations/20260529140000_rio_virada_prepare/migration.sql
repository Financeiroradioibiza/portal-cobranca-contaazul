-- Snapshot parcial da listagem CA durante virada em lotes (evita timeout Netlify).
ALTER TABLE "rio_comp_month" ADD COLUMN "virada_prepare" JSONB;
