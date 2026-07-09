-- Pastas especiais reutilizáveis em programações
CREATE TABLE IF NOT EXISTS "pasta_especial" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "velocidade" VARCHAR(16) NOT NULL DEFAULT 'media',
    "selecionavel" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pasta_especial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pasta_especial_musica" (
    "pasta_especial_id" TEXT NOT NULL,
    "musica_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasta_especial_musica_pkey" PRIMARY KEY ("pasta_especial_id","musica_id")
);

CREATE INDEX IF NOT EXISTS "pasta_especial_musica_musica_id_idx" ON "pasta_especial_musica"("musica_id");

ALTER TABLE "pasta_especial_musica" ADD CONSTRAINT "pasta_especial_musica_pasta_especial_id_fkey" FOREIGN KEY ("pasta_especial_id") REFERENCES "pasta_especial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pasta_especial_musica" ADD CONSTRAINT "pasta_especial_musica_musica_id_fkey" FOREIGN KEY ("musica_id") REFERENCES "musica_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
