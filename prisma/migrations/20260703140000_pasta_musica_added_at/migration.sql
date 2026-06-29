-- Data de entrada da faixa em cada pasta (vínculo pasta_musica).
-- Registros antigos ficam NULL até nova entrada; novos vínculos recebem added_at via Prisma @default(now()).
ALTER TABLE "pasta_musica" ADD COLUMN "added_at" TIMESTAMP(3);
