CREATE TABLE "portal_agenda_compromisso" (
    "id" TEXT NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "inicio_em" TIMESTAMP(3) NOT NULL,
    "criado_por_email" VARCHAR(200) NOT NULL,
    "criado_por_nome" VARCHAR(120) NOT NULL,
    "participantes_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_agenda_compromisso_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portal_agenda_compromisso_inicio_em_idx" ON "portal_agenda_compromisso"("inicio_em");
CREATE INDEX "portal_agenda_compromisso_criado_por_email_idx" ON "portal_agenda_compromisso"("criado_por_email");
