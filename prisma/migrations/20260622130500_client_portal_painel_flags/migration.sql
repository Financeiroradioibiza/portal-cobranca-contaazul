-- Flags manuais do painel principal (somente portal; não Conta Azul).
ALTER TABLE "client_portal_meta" ADD COLUMN "painel_bloqueio" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "client_portal_meta" ADD COLUMN "painel_inativo" BOOLEAN NOT NULL DEFAULT false;
