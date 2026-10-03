-- AlterTable
ALTER TABLE `chamado` ADD COLUMN `agenda_visivel_desde` DATETIME(3) NULL;

-- Backfill: chamados existentes visíveis desde a criação
UPDATE `chamado` SET `agenda_visivel_desde` = `created_at` WHERE `agenda_visivel_desde` IS NULL;

-- AlterTable
ALTER TABLE `chamado` ADD COLUMN `agenda_visivel_notificado` BOOLEAN NOT NULL DEFAULT true;

-- Chamados novos passam a usar false quando abertos com data futura; legado já notificado
UPDATE `chamado` SET `agenda_visivel_notificado` = true;
