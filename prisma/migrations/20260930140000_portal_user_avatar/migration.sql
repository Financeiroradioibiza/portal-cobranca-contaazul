-- AlterTable
ALTER TABLE "portal_user" ADD COLUMN "avatar_mime" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "portal_user" ADD COLUMN "avatar_base64" TEXT NOT NULL DEFAULT '';
