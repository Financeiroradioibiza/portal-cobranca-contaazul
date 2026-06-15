-- Portal users & profiles (Config / Usuários e perfis)

CREATE TABLE "portal_profile" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(8) NOT NULL DEFAULT '👤',
    "description" TEXT NOT NULL DEFAULT '',
    "permissions_json" TEXT NOT NULL DEFAULT '{}',
    "roles_json" TEXT NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_profile_slug_key" ON "portal_profile"("slug");

CREATE TABLE "portal_user" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL DEFAULT '',
    "job_title" VARCHAR(120) NOT NULL DEFAULT '',
    "password_hash" TEXT NOT NULL,
    "totp_secret" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_user_email_key" ON "portal_user"("email");
CREATE INDEX "portal_user_profile_id_idx" ON "portal_user"("profile_id");

ALTER TABLE "portal_user" ADD CONSTRAINT "portal_user_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "portal_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
