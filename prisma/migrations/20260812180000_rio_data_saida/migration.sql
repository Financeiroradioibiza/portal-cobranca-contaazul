-- Data de saída manual (encerramento) — linha cliente=PDV e PDVs filhos.
ALTER TABLE "rio_comp_cliente_linha"
  ADD COLUMN IF NOT EXISTS "data_saida_texto" VARCHAR(80) NOT NULL DEFAULT '';

ALTER TABLE "rio_comp_pdv"
  ADD COLUMN IF NOT EXISTS "data_saida_texto" VARCHAR(80) NOT NULL DEFAULT '';
