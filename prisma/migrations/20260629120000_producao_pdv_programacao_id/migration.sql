ALTER TABLE "producao_pdv_cadastro"
  ADD COLUMN IF NOT EXISTS "programacao_id" TEXT;

ALTER TABLE "producao_pdv_cadastro"
  ADD CONSTRAINT "producao_pdv_cadastro_programacao_id_fkey"
  FOREIGN KEY ("programacao_id") REFERENCES "programacao"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "producao_pdv_cadastro_programacao_id_idx"
  ON "producao_pdv_cadastro"("programacao_id");
