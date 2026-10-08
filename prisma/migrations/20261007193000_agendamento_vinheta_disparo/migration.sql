-- Cronograma: vinheta única com disparo pontual (1×/dia no relógio) + migra abertura/encerramento legado

CREATE TYPE "AgendamentoVinhetaDisparo" AS ENUM ('recorrente', 'horario_fixo');

ALTER TABLE "agendamento"
  ADD COLUMN IF NOT EXISTS "vinheta_disparo" "AgendamentoVinhetaDisparo" NOT NULL DEFAULT 'recorrente';

INSERT INTO "agendamento" (
  "id",
  "programacao_id",
  "alvo_tipo",
  "alvo_id",
  "dias_semana",
  "hora_inicio",
  "hora_fim",
  "vinheta_disparo",
  "frequencia_min",
  "frequencia_musicas",
  "prioridade",
  "ativo",
  "created_at",
  "updated_at"
)
SELECT
  'mhf_' || h."id",
  h."programacao_id",
  'vinheta'::"AgendamentoAlvo",
  h."vinheta_id",
  '',
  h."hora",
  h."hora",
  'horario_fixo'::"AgendamentoVinhetaDisparo",
  NULL,
  NULL,
  0,
  true,
  h."created_at",
  NOW()
FROM "programacao_vinheta_horario_fixo" h
WHERE h."ativo" = true
  AND h."vinheta_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "agendamento" a WHERE a."id" = 'mhf_' || h."id");

UPDATE "programacao_vinheta_horario_fixo"
SET "ativo" = false
WHERE "ativo" = true;
