-- CreateTable
CREATE TABLE "client_portal_meta" (
    "client_id" TEXT NOT NULL,
    "has_active_contract" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_meta_pkey" PRIMARY KEY ("client_id")
);
