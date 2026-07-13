import { portalQuery } from '../../criacao/portalDb.js';

function tagBloqueiaPlayer(tag) {
  return tag === 'cancelado' || tag === 'bloqueio_financeiro';
}

function effectiveRioTag(pdvTag, linhaTag) {
  const pt =
    pdvTag === 'cancelado' || pdvTag === 'bloqueio_financeiro' ? pdvTag : 'cobrando';
  if (pt !== 'cobrando') return pt;
  return linhaTag === 'cancelado' || linhaTag === 'bloqueio_financeiro' ? linhaTag : 'cobrando';
}

/**
 * Avalia bloqueio de reprodução: Planilha Rio + cadastro produção prevalecem sobre
 * `pdvs.status`/`clientes.status` desatualizados no gateway após voltar para COBRANDO.
 *
 * @returns {{ bloqueado: boolean, pdvStatus: 'A'|'I', clienteStatus: 'A'|'I', healGateway: boolean }}
 */
export async function avaliarBloqueioReproducao(row) {
  const rioPdvId = String(row.origem_rio_pdv_id ?? '').trim();
  const rioLinhaId = String(
    row.origem_rio_linha_id ?? row.cliente_origem_rio_linha_id ?? '',
  ).trim();

  if (!rioPdvId && !rioLinhaId) {
    const bloqueado = row.pdv_status === 'I' || row.cliente_status === 'I';
    return {
      bloqueado,
      pdvStatus: row.pdv_status === 'I' ? 'I' : 'A',
      clienteStatus: row.cliente_status === 'I' ? 'I' : 'A',
      healGateway: false,
    };
  }

  try {
    if (rioPdvId) {
      const res = await portalQuery(
        `SELECT p.tag_cobranca AS pdv_tag,
                l.tag_cobranca AS linha_tag,
                c.status_player AS status_player
           FROM rio_comp_pdv p
           JOIN rio_comp_cliente_linha l ON l.id = p.cliente_id
           LEFT JOIN producao_pdv_cadastro c ON c.rio_pdv_key = p.id
          WHERE p.id = $1
          LIMIT 1`,
        [rioPdvId],
      );
      const hit = res.rows[0];
      if (!hit) {
        return fallbackGateway(row);
      }

      const cadastroInativo = String(hit.status_player ?? '') === 'Inativo';
      const tag = effectiveRioTag(hit.pdv_tag, hit.linha_tag);
      const bloqueado = cadastroInativo || tagBloqueiaPlayer(tag);
      const pdvStatus = bloqueado ? 'I' : 'A';
      const clienteStatus = bloqueado ? 'I' : 'A';
      const healGateway =
        !bloqueado && (row.pdv_status === 'I' || row.cliente_status === 'I');

      return { bloqueado, pdvStatus, clienteStatus, healGateway };
    }

    const res = await portalQuery(
      `SELECT tag_cobranca FROM rio_comp_cliente_linha WHERE id = $1 LIMIT 1`,
      [rioLinhaId],
    );
    const linhaTag = res.rows[0]?.tag_cobranca;
    const bloqueado = tagBloqueiaPlayer(linhaTag);
    const status = bloqueado ? 'I' : 'A';
    const healGateway =
      !bloqueado && (row.pdv_status === 'I' || row.cliente_status === 'I');

    return {
      bloqueado,
      pdvStatus: status,
      clienteStatus: status,
      healGateway,
    };
  } catch (err) {
    console.error('[rioCobrancaBlock]', err);
    return fallbackGateway(row);
  }
}

function fallbackGateway(row) {
  const bloqueado = row.pdv_status === 'I' || row.cliente_status === 'I';
  return {
    bloqueado,
    pdvStatus: row.pdv_status === 'I' ? 'I' : 'A',
    clienteStatus: row.cliente_status === 'I' ? 'I' : 'A',
    healGateway: false,
  };
}

/** @deprecated use avaliarBloqueioReproducao */
export async function pdvBloqueadoPorRioOuCadastro(row) {
  const r = await avaliarBloqueioReproducao(row);
  return r.bloqueado;
}

export async function healGatewayStatusSeNecessario(pool, row, avaliacao) {
  if (!avaliacao.healGateway) return;
  const pdvId = row.pdv_id;
  const clienteId = row.cliente_id;
  if (avaliacao.pdvStatus === 'A') {
    await pool
      .query(`UPDATE pdvs SET status = 'A', updated_at = now() WHERE id = $1 AND status = 'I'`, [
        pdvId,
      ])
      .catch(() => null);
  }
  if (avaliacao.clienteStatus === 'A' && clienteId) {
    await pool
      .query(`UPDATE clientes SET status = 'A' WHERE id = $1 AND status = 'I'`, [clienteId])
      .catch(() => null);
  }
}
