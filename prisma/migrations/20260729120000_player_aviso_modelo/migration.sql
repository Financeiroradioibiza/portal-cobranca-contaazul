-- Modelos automatizados de aviso (cadastro loja / financeiro)
ALTER TABLE "player_aviso_operador" ADD COLUMN "modelo" TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX "player_aviso_operador_portal_cliente_id_portal_pdv_id_modelo_idx"
  ON "player_aviso_operador"("portal_cliente_id", "portal_pdv_id", "modelo");
