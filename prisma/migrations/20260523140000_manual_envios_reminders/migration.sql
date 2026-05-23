-- CreateEnum
CREATE TYPE "ManualReminderRowStatus" AS ENUM ('pendente', 'solicitado_ordem', 'enviado');

-- CreateTable
CREATE TABLE "manual_reminder_template" (
    "id" TEXT NOT NULL,
    "emission_day" INTEGER NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cnpj_documento" TEXT,
    "solicitar_pedir_oc" BOOLEAN NOT NULL DEFAULT true,
    "spreadsheet_hint" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_reminder_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_reminder_month" (
    "id" TEXT NOT NULL,
    "year_month" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_reminder_month_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_reminder_row" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "emission_day" INTEGER NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cnpj_documento" TEXT,
    "conta_azul_person_id" TEXT,
    "solicitar_pedir_oc" BOOLEAN NOT NULL DEFAULT true,
    "status" "ManualReminderRowStatus" NOT NULL DEFAULT 'pendente',
    "email_cobranca" TEXT,
    "spreadsheet_hint" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_reminder_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_reminder_month_year_month_key" ON "manual_reminder_month"("year_month");

-- CreateIndex
CREATE INDEX "manual_reminder_row_month_id_emission_day_sort_order_idx" ON "manual_reminder_row"("month_id", "emission_day", "sort_order");

-- AddForeignKey
ALTER TABLE "manual_reminder_row"
ADD CONSTRAINT "manual_reminder_row_month_id_fkey"
FOREIGN KEY ("month_id") REFERENCES "manual_reminder_month"("id") ON DELETE CASCADE ON UPDATE CASCADE;
