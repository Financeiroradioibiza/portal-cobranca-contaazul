-- CreateTable
CREATE TABLE "oc_email_template" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oc_email_template_pkey" PRIMARY KEY ("id")
);
