-- Controle player: default Sim (usuário pode avançar/voltar faixa no PWA).
UPDATE "producao_pdv_cadastro" SET "controlar_player" = true WHERE "controlar_player" = false;

ALTER TABLE "producao_pdv_cadastro" ALTER COLUMN "controlar_player" SET DEFAULT true;
