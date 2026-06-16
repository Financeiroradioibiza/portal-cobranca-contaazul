-- Tags operacionais Rio: COBRANDO (padrão), CANCELADO, Bloqueio financeiro
CREATE TYPE "RioTagCobranca" AS ENUM ('cobrando', 'cancelado', 'bloqueio_financeiro');

ALTER TABLE "rio_comp_cliente_linha"
ADD COLUMN "tag_cobranca" "RioTagCobranca" NOT NULL DEFAULT 'cobrando';

ALTER TABLE "rio_comp_pdv"
ADD COLUMN "tag_cobranca" "RioTagCobranca" NOT NULL DEFAULT 'cobrando';
