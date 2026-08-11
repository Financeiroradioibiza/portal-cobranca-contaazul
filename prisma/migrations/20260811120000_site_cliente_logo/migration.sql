-- Logo JPEG do cliente no Site Clientes (fallback quando não há portal_cliente_id no player).
ALTER TABLE "site_cliente_moodboard" ADD COLUMN IF NOT EXISTS "logo_jpeg_base64" TEXT NOT NULL DEFAULT '';
