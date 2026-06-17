-- CreateTable
CREATE TABLE "portal_audit_log" (
    "id" TEXT NOT NULL,
    "user_email" VARCHAR(200) NOT NULL,
    "user_display_name" VARCHAR(120) NOT NULL DEFAULT '',
    "user_id" TEXT,
    "action" VARCHAR(200) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "query" VARCHAR(500) NOT NULL DEFAULT '',
    "ip" VARCHAR(64) NOT NULL DEFAULT '',
    "user_agent" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_audit_log_created_at_idx" ON "portal_audit_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "portal_audit_log_user_email_idx" ON "portal_audit_log"("user_email");

-- AddForeignKey
ALTER TABLE "portal_audit_log" ADD CONSTRAINT "portal_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "portal_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
