-- Pastas custom na biblioteca musical (organização estilo playlist)
CREATE TABLE IF NOT EXISTS "biblioteca_pasta" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "cor" VARCHAR(9) NOT NULL DEFAULT '#6366f1',
    "icone" VARCHAR(32) NOT NULL DEFAULT 'folder',
    "criativo_user_id" VARCHAR(200),
    "criativo_nome" VARCHAR(120) NOT NULL DEFAULT '',
    "criativo_iniciais" VARCHAR(8) NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biblioteca_pasta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "biblioteca_pasta_sort_order_idx" ON "biblioteca_pasta"("sort_order");

CREATE TABLE IF NOT EXISTS "biblioteca_pasta_musica" (
    "pasta_id" TEXT NOT NULL,
    "musica_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biblioteca_pasta_musica_pkey" PRIMARY KEY ("pasta_id","musica_id")
);

CREATE INDEX IF NOT EXISTS "biblioteca_pasta_musica_musica_id_idx" ON "biblioteca_pasta_musica"("musica_id");

ALTER TABLE "biblioteca_pasta_musica" ADD CONSTRAINT "biblioteca_pasta_musica_pasta_id_fkey" FOREIGN KEY ("pasta_id") REFERENCES "biblioteca_pasta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "biblioteca_pasta_musica" ADD CONSTRAINT "biblioteca_pasta_musica_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
