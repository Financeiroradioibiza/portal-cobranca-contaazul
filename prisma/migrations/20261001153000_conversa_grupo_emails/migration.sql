-- Pessoas fixas notificadas em todo message do assunto (#Mus_Cliente, canal, prospect).
ALTER TABLE "chamado_conversa_assunto" ADD COLUMN IF NOT EXISTS "grupo_emails_json" TEXT NOT NULL DEFAULT '[]';
