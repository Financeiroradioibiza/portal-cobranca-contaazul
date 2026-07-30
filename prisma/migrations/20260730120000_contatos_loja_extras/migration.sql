-- Contatos extras de loja (gerentes adicionais) no cadastro PDV produção
ALTER TABLE "producao_pdv_cadastro"
ADD COLUMN IF NOT EXISTS "contatos_loja_extras_json" TEXT NOT NULL DEFAULT '[]';
