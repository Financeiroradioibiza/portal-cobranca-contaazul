-- Chamados legados: data inicial = abertura (aparecem na agenda como antes)
UPDATE `chamado`
SET `agenda_visivel_desde` = `created_at`
WHERE `agenda_visivel_desde` IS NULL;
