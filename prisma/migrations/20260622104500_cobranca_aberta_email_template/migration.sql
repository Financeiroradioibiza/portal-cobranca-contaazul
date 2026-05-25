-- CreateTable
CREATE TABLE "cobranca_aberta_email_template" (
    "id" TEXT NOT NULL,
    "subject" VARCHAR(480) NOT NULL,
    "body_text" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobranca_aberta_email_template_pkey" PRIMARY KEY ("id")
);
