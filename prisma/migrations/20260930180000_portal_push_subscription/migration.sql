-- CreateTable
CREATE TABLE "portal_push_subscription" (
    "id" TEXT NOT NULL,
    "user_email" VARCHAR(200) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" VARCHAR(200) NOT NULL,
    "auth" VARCHAR(80) NOT NULL,
    "user_agent" VARCHAR(400) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_push_subscription_endpoint_key" ON "portal_push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "portal_push_subscription_user_email_idx" ON "portal_push_subscription"("user_email");
