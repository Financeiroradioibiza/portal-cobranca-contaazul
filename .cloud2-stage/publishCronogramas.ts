import type pg from 'pg';
import { portalQuery } from '../../criacao/portalDb.js';

type GwClient = pg.PoolClient;

type NeonAg = {
  id: string;
  alvo_tipo: string;
  alvo_id: string;
  dias_semana: string;
  hora_inicio: string;
  hora_fim: string;
  data_inicio: string | null;
  data_fim: string | null;
  frequencia_min: number | null;
  frequencia_musicas: number | null;
};

type NeonVinheta = {
  id: string;
  nome: string;
  storage_key: string | null;
  titulo: string;
};

function horaLegacy(h: string): string {
  const s = (h || '00:00').trim();
  return s.length === 5 ? `${s}:00` : s;
}

function diasFromCsv(csv: string): number[] {
  const raw = (csv || '').trim();
  if (!raw) return [0, 1, 2, 3, 4, 5, 6];
  return raw
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

async function ensureAgendasSchema(gw: GwClient): Promise<void> {
  await gw.query(`
    CREATE TABLE IF NOT EXISTS agendas (
      id SERIAL PRIMARY KEY,
      programa_id INT NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
      playlist_id INT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      data_agendada DATE,
      dia_semana INT,
      hora_inicio TIME NOT NULL DEFAULT '00:00:00',
      hora_fim TIME NOT NULL DEFAULT '23:59:59',
      tocar_cada INT,
      tipo_tocar TEXT,
      data_fim DATE
    )
  `);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS origem_pasta_id TEXT`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS origem_vinheta_id TEXT`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS publicado CHAR(1) NOT NULL DEFAULT 'S'`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS tipo_agendamento TEXT DEFAULT ''`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS selecionavel CHAR(1) NOT NULL DEFAULT 'N'`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS prioritaria CHAR(1) NOT NULL DEFAULT 'N'`);
}

async function upsertVinhetaMusica(
  gw: GwClient,
  v: NeonVinheta,
): Promise<number | null> {
  if (!v.storage_key?.trim()) return null;
  const mg = await gw.query<{ id: number }>(
    `INSERT INTO musicas (titulo, nome_arquivo, tamanho_bytes, duracao, corte_seg, storage_key, origem_musica_id)
       VALUES ($1, $2, 0, make_interval(secs => 30), 0, $3, $4)
     ON CONFLICT (origem_musica_id) DO UPDATE SET
       titulo = EXCLUDED.titulo, storage_key = EXCLUDED.storage_key
     RETURNING id`,
    [v.titulo || v.nome, `${v.nome || 'vinheta'}.mp3`, v.storage_key, `vinheta:${v.id}`],
  );
  return mg.rows[0]?.id ?? null;
}

/** Publica cronogramas (pastas) e vinhetas VP/VA no gateway — consumidos por /agendas/ e /vinhetas_*. */
export async function publishCronogramasAndVinhetas(
  gw: GwClient,
  programacaoId: string,
  programaId: number,
  pastaPlaylistMap: Map<string, number>,
): Promise<{ agendas: number; vinhetas: number; vinhetasSemAudio: number }> {
  await ensureAgendasSchema(gw);
  await gw.query(`DELETE FROM agendas WHERE programa_id = $1`, [programaId]);

  const agRes = await portalQuery<NeonAg>(
    `SELECT id, alvo_tipo::text AS alvo_tipo, alvo_id, dias_semana, hora_inicio, hora_fim,
            data_inicio::text AS data_inicio, data_fim::text AS data_fim,
            frequencia_min, frequencia_musicas
       FROM agendamento
      WHERE programacao_id = $1 AND ativo = true`,
    [programacaoId],
  );

  const vinRes = await portalQuery<NeonVinheta>(
    `SELECT id, nome, storage_key, COALESCE(NULLIF(trim(texto), ''), nome) AS titulo
       FROM vinheta WHERE programacao_id = $1`,
    [programacaoId],
  );
  const vinById = new Map(vinRes.rows.map((v) => [v.id, v]));

  let agendas = 0;
  let vinhetas = 0;
  let vinhetasSemAudio = 0;

  for (const ag of agRes.rows) {
    if (ag.alvo_tipo === 'pasta') {
      const playlistId = pastaPlaylistMap.get(ag.alvo_id);
      if (!playlistId) continue;
      const tocarCada = ag.frequencia_musicas ?? null;
      const tipoTocar = ag.frequencia_musicas ? 'musica' : null;
      for (const dia of diasFromCsv(ag.dias_semana)) {
        await gw.query(
          `INSERT INTO agendas (programa_id, playlist_id, data_agendada, dia_semana, hora_inicio, hora_fim, tocar_cada, tipo_tocar, data_fim)
             VALUES ($1, $2, $3::date, $4, $5::time, $6::time, $7, $8, $9::date)`,
          [
            programaId,
            playlistId,
            ag.data_inicio,
            dia,
            horaLegacy(ag.hora_inicio),
            horaLegacy(ag.hora_fim),
            tocarCada,
            tipoTocar,
            ag.data_fim,
          ],
        );
        agendas++;
      }
      if (ag.frequencia_musicas) {
        await gw.query(
          `UPDATE playlists SET tocar_cada = $1, tipo_tocar = 'musica' WHERE id = $2`,
          [ag.frequencia_musicas, playlistId],
        );
      }
      continue;
    }

    if (ag.alvo_tipo !== 'vinheta') continue;
    const vin = vinById.get(ag.alvo_id);
    if (!vin) continue;

    const musicaId = await upsertVinhetaMusica(gw, vin);
    if (!musicaId) {
      vinhetasSemAudio++;
      continue;
    }

    const isVa = Boolean(ag.data_inicio);
    const tipo = isVa ? 'VA' : 'VP';
    const tocarCada = ag.frequencia_min ?? ag.frequencia_musicas ?? 15;
    const tipoTocar = ag.frequencia_musicas ? 'musica' : 'minuto';

    const pl = await gw.query<{ id: number }>(
      `INSERT INTO playlists (programa_id, pdv_id, nome, tipo, tocar_sempre, tempo_total, tocar_cada, tipo_tocar, origem_vinheta_id, publicado, tipo_agendamento)
         VALUES ($1, NULL, $2, $3, 'N', make_interval(secs => 30), $4, $5, $6, 'S', $7)
       RETURNING id`,
      [programaId, vin.nome, tipo, tocarCada, tipoTocar, vin.id, isVa ? 'agendada' : 'programada'],
    );
    const playlistId = pl.rows[0].id;
    vinhetas++;

    await gw.query(
      `INSERT INTO playlist_musicas (playlist_id, musica_id, ordem) VALUES ($1, $2, 0)
       ON CONFLICT (playlist_id, musica_id) DO NOTHING`,
      [playlistId, musicaId],
    );

    if (isVa) {
      await gw.query(
        `INSERT INTO agendas (programa_id, playlist_id, data_agendada, dia_semana, hora_inicio, hora_fim, tocar_cada, tipo_tocar, data_fim)
           VALUES ($1, $2, $3::date, NULL, $4::time, $5::time, $6, $7, $8::date)`,
        [
          programaId,
          playlistId,
          ag.data_inicio,
          horaLegacy(ag.hora_inicio),
          horaLegacy(ag.hora_fim),
          tocarCada,
          tipoTocar,
          ag.data_fim,
        ],
      );
    } else {
      for (const dia of diasFromCsv(ag.dias_semana)) {
        await gw.query(
          `INSERT INTO agendas (programa_id, playlist_id, data_agendada, dia_semana, hora_inicio, hora_fim, tocar_cada, tipo_tocar, data_fim)
             VALUES ($1, $2, NULL, $3, $4::time, $5::time, $6, $7, NULL)`,
          [programaId, playlistId, dia, horaLegacy(ag.hora_inicio), horaLegacy(ag.hora_fim), tocarCada, tipoTocar],
        );
        agendas++;
      }
    }
    agendas++;
  }

  await syncPastasSelecionavelFlags(gw, programacaoId, pastaPlaylistMap);

  const pastasComCronograma = new Set(
    agRes.rows.filter((ag) => ag.alvo_tipo === 'pasta').map((ag) => ag.alvo_id),
  );
  agendas += await ensureDefaultAgendasForUnscheduledPastas(
    gw,
    programacaoId,
    programaId,
    pastaPlaylistMap,
    pastasComCronograma,
  );

  return { agendas, vinhetas, vinhetasSemAudio };
}

/** Pastas sem cronograma no portal tocam o dia todo (Player 5 usa /agendas/ no slot). */
async function ensureDefaultAgendasForUnscheduledPastas(
  gw: GwClient,
  programacaoId: string,
  programaId: number,
  pastaPlaylistMap: Map<string, number>,
  pastasComCronograma: Set<string>,
): Promise<number> {
  const pastasSelRes = await portalQuery<{ id: string; selecionavel: boolean }>(
    `SELECT id, COALESCE(selecionavel, false) AS selecionavel
       FROM pasta WHERE programacao_id = $1`,
    [programacaoId],
  );
  const selecionavelByPastaId = new Map(
    pastasSelRes.rows.map((p) => [p.id, neonSelecionavelAtivo(p.selecionavel)]),
  );

  let created = 0;
  for (const [pastaId, playlistId] of pastaPlaylistMap) {
    if (pastasComCronograma.has(pastaId)) continue;
    if (selecionavelByPastaId.get(pastaId)) continue;
    for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
      await gw.query(
        `INSERT INTO agendas (programa_id, playlist_id, data_agendada, dia_semana, hora_inicio, hora_fim, tocar_cada, tipo_tocar, data_fim)
           VALUES ($1, $2, NULL, $3, '00:00:00'::time, '23:59:59'::time, NULL, NULL, NULL)`,
        [programaId, playlistId, dia],
      );
      created++;
    }
  }
  return created;
}

export function neonSelecionavelAtivo(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 't' || s === 'true' || s === '1';
}

/**
 * Sincroniza `selecionavel` + `tocar_sempre` de **todas** as pastas da programação
 * (não só as que têm cronograma — pastas selecionáveis costumam ser «tocar sempre»).
 */
export async function syncPastasSelecionavelFlags(
  gw: GwClient,
  programacaoId: string,
  pastaPlaylistMap: Map<string, number>,
): Promise<number> {
  const pastasSelRes = await portalQuery<{ id: string; selecionavel: boolean }>(
    `SELECT id, COALESCE(selecionavel, false) AS selecionavel
       FROM pasta WHERE programacao_id = $1`,
    [programacaoId],
  );
  const selecionavelByPastaId = new Map(
    pastasSelRes.rows.map((p) => [p.id, neonSelecionavelAtivo(p.selecionavel)]),
  );

  const agPastasRes = await portalQuery<{ alvo_id: string }>(
    `SELECT DISTINCT alvo_id
       FROM agendamento
      WHERE programacao_id = $1 AND ativo = true AND alvo_tipo = 'pasta'`,
    [programacaoId],
  );
  const pastasComCronograma = new Set(agPastasRes.rows.map((r) => r.alvo_id));

  let updated = 0;
  for (const [pastaId, playlistId] of pastaPlaylistMap) {
    const isSel = selecionavelByPastaId.get(pastaId) === true;
    if (isSel) {
      await gw.query(
        `UPDATE playlists SET selecionavel = 'S', tocar_sempre = 'N', prioritaria = 'N', publicado = 'S' WHERE id = $1`,
        [playlistId],
      );
    } else if (pastasComCronograma.has(pastaId)) {
      await gw.query(
        `UPDATE playlists SET selecionavel = 'N', prioritaria = 'N', tocar_sempre = 'N', publicado = 'S' WHERE id = $1`,
        [playlistId],
      );
    } else {
      await gw.query(
        `UPDATE playlists SET selecionavel = 'N', prioritaria = 'N', tocar_sempre = 'S', publicado = 'S' WHERE id = $1`,
        [playlistId],
      );
    }
    updated++;
  }
  return updated;
}
