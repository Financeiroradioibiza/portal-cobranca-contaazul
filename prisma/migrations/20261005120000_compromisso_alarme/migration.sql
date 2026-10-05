ALTER TABLE "portal_agenda_compromisso"
  ADD COLUMN "alarme_ativo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alarme_notificado" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "portal_agenda_compromisso_alarme_pending_idx"
  ON "portal_agenda_compromisso" ("inicio_em")
  WHERE "alarme_ativo" = true AND "alarme_notificado" = false;
