-- CreateTable
CREATE TABLE "envio_manual_agendamento" (
    "id" TEXT NOT NULL,
    "tipo" VARCHAR(16) NOT NULL DEFAULT 'individual',
    "client_label" VARCHAR(240) NOT NULL DEFAULT '',
    "ca_cliente_id" VARCHAR(64),
    "dia_mes" INTEGER NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "emails" JSONB NOT NULL,
    "mensagem" TEXT NOT NULL DEFAULT '',
    "color_idx" INTEGER NOT NULL DEFAULT 0,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "grupo_clientes" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envio_manual_agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio_manual_log" (
    "id" TEXT NOT NULL,
    "client_label" VARCHAR(240) NOT NULL DEFAULT '',
    "emails_snapshot" TEXT NOT NULL DEFAULT '',
    "referencia" VARCHAR(480) NOT NULL DEFAULT '',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "aviso" VARCHAR(480) NOT NULL DEFAULT '',
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envio_manual_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "envio_manual_agendamento_dia_mes_sent_idx" ON "envio_manual_agendamento"("dia_mes", "sent");

-- CreateIndex
CREATE INDEX "envio_manual_agendamento_sort_order_idx" ON "envio_manual_agendamento"("sort_order");

-- CreateIndex
CREATE INDEX "envio_manual_log_created_at_idx" ON "envio_manual_log"("created_at" DESC);
