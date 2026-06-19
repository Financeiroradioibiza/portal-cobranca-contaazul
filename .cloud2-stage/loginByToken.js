import { getPool } from '../../db/pool.js';

function formatLegacyDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Carrega sessão do Player pelo token de instalação/sessão (tabela tokens). */
export async function loadSessionByToken(token) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       t.token, t.data_inicio, t.data_fim, t.status AS token_status,
       p.id AS pdv_id, p.nome AS pdv_nome,
       COALESCE(p.status, 'A') AS pdv_status,
       COALESCE(p.instalado, 'N') AS instalado,
       COALESCE(p.atualizacao_pendente, 'N') AS atualizacao_pendente,
       COALESCE(p.atualizacao_pendente_agenda, 'N') AS atualizacao_pendente_agenda,
       COALESCE(p.ctrl_player, 'N') AS ctrl_player,
       COALESCE(p.ctrl_placa_carro, 'N') AS ctrl_placa_carro,
       COALESCE(p.ctrl_playlists, 'N') AS ctrl_playlists,
       p.serial_instalacao, p.versao_player, p.date_last_update,
       c.id AS cliente_id, c.nome AS cliente_nome,
       COALESCE(c.status, 'A') AS cliente_status,
       COALESCE(c.logotipo, '') AS logotipo
     FROM tokens t
     JOIN pdvs p ON p.id = t.pdv_id
     JOIN clientes c ON c.id = p.cliente_id
     WHERE t.token = $1
     LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

export function sessionArrayFromRow(row) {
  const dataFim = row.data_fim ? new Date(row.data_fim) : null;
  const expired = dataFim && dataFim.getTime() < Date.now();
  return [
    {
      token: {
        token: row.token,
        data_inicio: formatLegacyDateTime(row.data_inicio) ?? '',
        data_fim: formatLegacyDateTime(row.data_fim),
        pdv_id: row.pdv_id,
        status: expired ? 'token_vencido' : row.token_status ?? 'ok',
      },
    },
    {
      pdv: {
        id: row.pdv_id,
        nome: row.pdv_nome,
        status: row.pdv_status,
        instalado: row.instalado,
        atualizacao_pendente: row.atualizacao_pendente,
        atualizacao_pendente_agenda: row.atualizacao_pendente_agenda,
        ctrl_player: row.ctrl_player,
        ctrl_placa_carro: row.ctrl_placa_carro,
        ctrl_playlists: row.ctrl_playlists,
        serial_instalacao: row.serial_instalacao ?? undefined,
        versao_player: row.versao_player ?? undefined,
        date_last_update: formatLegacyDateTime(row.date_last_update) ?? undefined,
      },
    },
    {
      cliente: {
        id: row.cliente_id,
        nome: row.cliente_nome,
        status: row.cliente_status,
        logotipo: row.logotipo,
      },
    },
  ];
}
