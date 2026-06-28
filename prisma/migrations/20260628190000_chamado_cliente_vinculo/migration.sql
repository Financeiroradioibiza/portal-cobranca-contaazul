-- Vínculo opcional de chamado com cliente/PDV da produção
ALTER TABLE `chamado` ADD COLUMN `rio_linha_id` VARCHAR(64) NULL;
ALTER TABLE `chamado` ADD COLUMN `rio_pdv_key` VARCHAR(120) NULL;
ALTER TABLE `chamado` ADD COLUMN `cliente_nome` VARCHAR(200) NOT NULL DEFAULT '';

CREATE INDEX `chamado_rio_linha_id_idx` ON `chamado`(`rio_linha_id`);
CREATE INDEX `chamado_rio_pdv_key_idx` ON `chamado`(`rio_pdv_key`);
