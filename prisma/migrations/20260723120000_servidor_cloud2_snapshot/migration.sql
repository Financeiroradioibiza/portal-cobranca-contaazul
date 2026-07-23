-- Snapshots periódicos (Config → Servidores) — disco e fila cloud2
CREATE TABLE IF NOT EXISTS "servidor_cloud2_snapshot" (
    "id" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disk_used_percent" DOUBLE PRECISION NOT NULL,
    "disk_free_bytes" BIGINT,
    "load_1" DOUBLE PRECISION,
    "cpu_count" INTEGER,
    "fila_aguardando" INTEGER NOT NULL DEFAULT 0,
    "fila_processando" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "servidor_cloud2_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "servidor_cloud2_snapshot_collected_at_idx"
    ON "servidor_cloud2_snapshot"("collected_at");
