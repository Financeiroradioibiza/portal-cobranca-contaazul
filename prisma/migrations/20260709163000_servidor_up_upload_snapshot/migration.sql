-- Servidor UP Multi-Upload: persiste hierarquia + match por job Deemix
CREATE TABLE IF NOT EXISTS "servidor_up_upload_snapshot" (
    "download_job_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servidor_up_upload_snapshot_pkey" PRIMARY KEY ("download_job_id")
);
