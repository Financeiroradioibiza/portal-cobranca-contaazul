-- CreateEnum
CREATE TYPE "DownloadProvider" AS ENUM ('spotizerr', 'deemix', 'youtube');

-- CreateEnum
CREATE TYPE "DownloadJobStatus" AS ENUM ('aguardando', 'processando', 'concluido', 'erro', 'cancelado');

-- CreateEnum
CREATE TYPE "DownloadItemStatus" AS ENUM ('aguardando', 'processando', 'concluido', 'erro');

-- CreateTable
CREATE TABLE "download_job" (
    "id" TEXT NOT NULL,
    "provider" "DownloadProvider" NOT NULL,
    "status" "DownloadJobStatus" NOT NULL DEFAULT 'aguardando',
    "titulo" VARCHAR(200) NOT NULL DEFAULT '',
    "criativo_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "criativo_user_id" VARCHAR(200),
    "total_itens" INTEGER NOT NULL DEFAULT 0,
    "itens_feitos" INTEGER NOT NULL DEFAULT 0,
    "erro_msg" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "download_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_item" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "linha_original" TEXT NOT NULL DEFAULT '',
    "input_tipo" VARCHAR(16) NOT NULL DEFAULT 'texto',
    "status" "DownloadItemStatus" NOT NULL DEFAULT 'aguardando',
    "arquivo_nome" VARCHAR(500) NOT NULL DEFAULT '',
    "titulo" VARCHAR(500) NOT NULL DEFAULT '',
    "artista" VARCHAR(500) NOT NULL DEFAULT '',
    "storage_key" VARCHAR(300),
    "size_bytes" INTEGER,
    "provider_ref" VARCHAR(200) NOT NULL DEFAULT '',
    "erro_msg" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "download_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "download_job_provider_status_created_at_idx" ON "download_job"("provider", "status", "created_at");

-- CreateIndex
CREATE INDEX "download_item_job_id_status_idx" ON "download_item"("job_id", "status");

-- CreateIndex
CREATE INDEX "download_item_status_created_at_idx" ON "download_item"("status", "created_at");

-- AddForeignKey
ALTER TABLE "download_item" ADD CONSTRAINT "download_item_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "download_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
