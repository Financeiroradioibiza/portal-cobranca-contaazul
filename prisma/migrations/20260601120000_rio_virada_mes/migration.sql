-- Virada de mês: fechar competência, grupos sistema, movimento em PDV
ALTER TABLE "rio_comp_month" ADD COLUMN "closed_at" TIMESTAMP(3);

ALTER TABLE "rio_comp_grupo" ADD COLUMN "system_tag" VARCHAR(32);

CREATE TYPE "RioPdvMovimento" AS ENUM ('estavel', 'entrada', 'saida');

ALTER TABLE "rio_comp_pdv" ADD COLUMN "movimento" "RioPdvMovimento" NOT NULL DEFAULT 'estavel';
