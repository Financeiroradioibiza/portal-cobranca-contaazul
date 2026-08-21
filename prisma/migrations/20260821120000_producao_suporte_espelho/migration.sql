CREATE TABLE "producao_suporte_espelho" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "payload_json" JSONB NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL,
    "telemetry_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producao_suporte_espelho_pkey" PRIMARY KEY ("id")
);
