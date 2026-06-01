-- Contratos CA gravados no portal (evita buscar centenas de clientes a cada «Atualizar»).
ALTER TABLE "client_portal_meta"
ADD COLUMN "active_contract_numbers" VARCHAR(400) NOT NULL DEFAULT '';

ALTER TABLE "client_portal_meta"
ADD COLUMN "contracts_fetched_at" TIMESTAMP(3);
