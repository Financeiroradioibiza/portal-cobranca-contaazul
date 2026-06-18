-- CreateTable
CREATE TABLE "portal_error_log" (
    "id" TEXT NOT NULL,
    "level" VARCHAR(10) NOT NULL DEFAULT 'error',
    "source" VARCHAR(12) NOT NULL DEFAULT 'client',
    "message" TEXT NOT NULL,
    "stack" TEXT NOT NULL DEFAULT '',
    "path" VARCHAR(500) NOT NULL DEFAULT '',
    "method" VARCHAR(10) NOT NULL DEFAULT '',
    "status" INTEGER,
    "user_email" VARCHAR(200) NOT NULL DEFAULT '',
    "user_agent" VARCHAR(500) NOT NULL DEFAULT '',
    "context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_error_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_error_log_created_at_idx" ON "portal_error_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "portal_error_log_level_idx" ON "portal_error_log"("level");

-- CreateIndex
CREATE INDEX "portal_error_log_source_idx" ON "portal_error_log"("source");
