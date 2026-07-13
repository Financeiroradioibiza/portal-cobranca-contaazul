import type pg from "pg";

type Db = pg.Pool | pg.PoolClient;

/**
 * Player 5 só exibe overlay de atualização na transição N→S.
 * Se o PDV já estava com pendente=S, manter S é “silencioso” — pulso força a borda.
 */
export async function pulseAtualizacaoPendente(
  db: Db,
  opts: { pdvIds?: number[]; clienteId?: number },
): Promise<number> {
  const pdvIds = (opts.pdvIds ?? []).filter((id) => Number.isFinite(id) && id > 0);
  if (pdvIds.length > 0) {
    await db.query(
      `UPDATE pdvs SET atualizacao_pendente = 'N', atualizacao_pendente_agenda = 'N' WHERE id = ANY($1::int[])`,
      [pdvIds],
    );
    const r = await db.query(
      `UPDATE pdvs SET atualizacao_pendente = 'S', atualizacao_pendente_agenda = 'S' WHERE id = ANY($1::int[])`,
      [pdvIds],
    );
    return r.rowCount ?? 0;
  }

  const clienteId = opts.clienteId;
  if (!Number.isFinite(clienteId) || !clienteId || clienteId <= 0) return 0;

  await db.query(
    `UPDATE pdvs SET atualizacao_pendente = 'N', atualizacao_pendente_agenda = 'N' WHERE cliente_id = $1`,
    [clienteId],
  );
  const r = await db.query(
    `UPDATE pdvs SET atualizacao_pendente = 'S', atualizacao_pendente_agenda = 'S' WHERE cliente_id = $1`,
    [clienteId],
  );
  return r.rowCount ?? 0;
}
