-- Prospect + subcanais Sup/Mus por cliente
ALTER TYPE "ChamadoConversaAssuntoTipo" ADD VALUE 'prospect';

ALTER TABLE "chamado_conversa_assunto" ADD COLUMN IF NOT EXISTS "cliente_papel" VARCHAR(8);
