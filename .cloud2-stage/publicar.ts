import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { criacaoConfig } from '../../criacao/config.js';
import { publishCronogramasAndVinhetas } from './publishCronogramas.js';

function authorized(req: { headers: Record<string, unknown> }): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret) return false;
  const got = String(req.headers['x-criacao-secret'] ?? '');
  if (got.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  } catch {
    return false;
  }
}

function safeFileName(artista: string, titulo: string): string {
  const base = `${artista || 'Desconhecido'} - ${titulo || 'Faixa'}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (base || 'faixa') + '.mp3';
}

const FORMATO_FALLBACK = 'mp3_128_mono';

type GwClient = pg.PoolClient;

/** Garante tabelas/colunas/índices do fluxo publicar (gateway legado + sync Player). */
async function ensurePublicarGatewaySchema(gw: GwClient): Promise<void> {
  await gw.query(`
    CREATE TABLE IF NOT EXISTS programas (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await gw.query(`ALTER TABLE programas ADD COLUMN IF NOT EXISTS origem_programacao_id TEXT`);
  // Índice completo (não parcial): ON CONFLICT (origem_programacao_id) exige constraint compatível.
  await gw.query(`DROP INDEX IF EXISTS programas_origem_programacao_id_uidx`);
  await gw.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS programas_origem_programacao_id_uidx
    ON programas (origem_programacao_id)
  `);

  await gw.query(`
    CREATE TABLE IF NOT EXISTS artistas (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      foto TEXT NOT NULL DEFAULT ''
    )
  `);

  await gw.query(`
    CREATE TABLE IF NOT EXISTS musicas (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      nome_arquivo TEXT NOT NULL,
      tamanho_bytes BIGINT NOT NULL DEFAULT 0,
      duracao INTERVAL NOT NULL DEFAULT '0',
      corte_seg INTEGER NOT NULL DEFAULT 0,
      storage_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await gw.query(`ALTER TABLE musicas ADD COLUMN IF NOT EXISTS origem_musica_id TEXT`);
  await gw.query(`DROP INDEX IF EXISTS musicas_origem_musica_id_uidx`);
  await gw.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS musicas_origem_musica_id_uidx
    ON musicas (origem_musica_id)
  `);

  await gw.query(`
    CREATE TABLE IF NOT EXISTS playlists (
      id SERIAL PRIMARY KEY,
      programa_id INTEGER NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
      pdv_id INTEGER REFERENCES pdvs(id) ON DELETE SET NULL,
      nome TEXT NOT NULL,
      tipo CHAR(2) NOT NULL DEFAULT 'N',
      tocar_sempre CHAR(1) NOT NULL DEFAULT 'S',
      tempo_total INTERVAL NOT NULL DEFAULT '0',
      tocar_cada INTEGER,
      tipo_tocar TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS origem_pasta_id TEXT`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS origem_vinheta_id TEXT`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS publicado CHAR(1) NOT NULL DEFAULT 'S'`);
  await gw.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS tipo_agendamento TEXT DEFAULT ''`);

  await gw.query(`
    CREATE TABLE IF NOT EXISTS playlist_musicas (
      id SERIAL PRIMARY KEY,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      musica_id INTEGER NOT NULL REFERENCES musicas(id) ON DELETE CASCADE,
      artista_id INTEGER REFERENCES artistas(id) ON DELETE SET NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      downloaded CHAR(1) NOT NULL DEFAULT '0',
      UNIQUE (playlist_id, musica_id)
    )
  `);
  // Tabela legada pode existir sem UNIQUE — CREATE TABLE IF NOT EXISTS não adiciona a constraint.
  await gw.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS playlist_musicas_playlist_musica_uidx
    ON playlist_musicas (playlist_id, musica_id)
  `);
}

interface NeonMusica {
  musica_id: string;
  titulo: string;
  artista: string;
  duration_ms: number | null;
  mix_segundos_finais: number | null;
  storage_key: string | null;
  size_bytes: number | null;
}

export async function registerPublicarRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  // Lista clientes do gateway (para o Portal escolher o destino da publicação)
  app.get(`${prefix}/gateway-clientes`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    const pool = getPool();
    const r = await pool.query<{ id: number; nome: string; pdvs: number }>(
      `SELECT c.id, c.nome, count(p.id)::int AS pdvs
         FROM clientes c LEFT JOIN pdvs p ON p.cliente_id = c.id
        GROUP BY c.id, c.nome ORDER BY c.nome`,
    );
    return reply.send({ ok: true, clientes: r.rows });
  });

  // Publica uma programação do Neon nas tabelas legadas do gateway (consumidas pelo player)
  app.post<{ Body: { programacaoId?: string; clienteIdGateway?: number } }>(
    `${prefix}/publicar`,
    async (req, reply) => {
      if (!authorized(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      const programacaoId = String(req.body?.programacaoId ?? '').trim();
      const clienteId = Number(req.body?.clienteIdGateway);
      if (!programacaoId || !Number.isFinite(clienteId) || clienteId <= 0) {
        return reply.code(400).send({ ok: false, error: 'parametros_invalidos' });
      }

      // 1) Carrega a programação do Neon
      const progRes = await portalQuery<{ nome: string; formato_padrao: string }>(
        `SELECT nome, formato_padrao::text AS formato_padrao FROM programacao WHERE id = $1 LIMIT 1`,
        [programacaoId],
      );
      if (progRes.rowCount === 0) return reply.code(404).send({ ok: false, error: 'programacao_nao_encontrada' });
      const prog = progRes.rows[0];
      const formatoAlvo = prog.formato_padrao || FORMATO_FALLBACK;

      const pastasRes = await portalQuery<{ id: string; nome: string }>(
        `SELECT id, nome FROM pasta WHERE programacao_id = $1 ORDER BY sort_order, nome`,
        [programacaoId],
      );

      const pool = getPool();
      const gw = await pool.connect();
      let totalPlaylists = 0;
      let totalMusicas = 0;
      let semArquivo = 0;
      let totalAgendas = 0;
      let totalVinhetas = 0;
      const pastaPlaylistMap = new Map<string, number>();
      try {
        await gw.query('BEGIN');
        await ensurePublicarGatewaySchema(gw);

        // garante cliente
        const cli = await gw.query<{ id: number }>(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
        if (cli.rowCount === 0) {
          await gw.query('ROLLBACK');
          return reply.code(404).send({ ok: false, error: 'cliente_gateway_inexistente' });
        }

        // upsert programa por origem
        const progGw = await gw.query<{ id: number }>(
          `INSERT INTO programas (cliente_id, nome, origem_programacao_id)
             VALUES ($1, $2, $3)
           ON CONFLICT (origem_programacao_id) DO UPDATE SET nome = EXCLUDED.nome, cliente_id = EXCLUDED.cliente_id
           RETURNING id`,
          [clienteId, prog.nome, programacaoId],
        );
        const programaId = progGw.rows[0].id;

        // re-sincroniza: limpa playlists antigas dessa programação
        await gw.query(`DELETE FROM playlists WHERE programa_id = $1`, [programaId]);

        for (const pasta of pastasRes.rows) {
          const musRes = await portalQuery<NeonMusica>(
            `SELECT pm.musica_id,
                    m.titulo, m.artista, m.duration_ms, m.mix_segundos_finais,
                    v.storage_key, v.size_bytes
               FROM pasta_musica pm
               JOIN musica_biblioteca m ON m.id = pm.musica_id
               LEFT JOIN LATERAL (
                 SELECT storage_key, size_bytes
                   FROM musica_versao
                  WHERE musica_id = pm.musica_id
                  ORDER BY (formato::text = $2) DESC, (formato::text = $3) DESC
                  LIMIT 1
               ) v ON true
              WHERE pm.pasta_id = $1
              ORDER BY pm.sort_order`,
            [pasta.id, formatoAlvo, FORMATO_FALLBACK],
          );

          const totalSeg = musRes.rows.reduce((s, m) => s + Math.round((m.duration_ms ?? 0) / 1000), 0);
          const pl = await gw.query<{ id: number }>(
            `INSERT INTO playlists (programa_id, pdv_id, nome, tipo, tocar_sempre, tempo_total, origem_pasta_id, publicado)
               VALUES ($1, NULL, $2, 'N', 'S', make_interval(secs => $3), $4, 'S')
             RETURNING id`,
            [programaId, pasta.nome, totalSeg, pasta.id],
          );
          const playlistId = pl.rows[0].id;
          pastaPlaylistMap.set(pasta.id, playlistId);
          totalPlaylists++;

          let ordem = 0;
          for (const m of musRes.rows) {
            if (!m.storage_key) {
              semArquivo++;
              continue;
            }
            // artista
            let artistaId: number | null = null;
            const an = (m.artista || '').trim();
            if (an) {
              const ar = await gw.query<{ id: number }>(`SELECT id FROM artistas WHERE nome = $1 LIMIT 1`, [an]);
              artistaId = ar.rowCount ? ar.rows[0].id : (await gw.query<{ id: number }>(`INSERT INTO artistas (nome) VALUES ($1) RETURNING id`, [an])).rows[0].id;
            }
            // musica (upsert por origem)
            const mg = await gw.query<{ id: number }>(
              `INSERT INTO musicas (titulo, nome_arquivo, tamanho_bytes, duracao, corte_seg, storage_key, origem_musica_id)
                 VALUES ($1, $2, $3, make_interval(secs => $4), $5, $6, $7)
               ON CONFLICT (origem_musica_id) DO UPDATE SET
                 titulo = EXCLUDED.titulo, nome_arquivo = EXCLUDED.nome_arquivo,
                 tamanho_bytes = EXCLUDED.tamanho_bytes, duracao = EXCLUDED.duracao,
                 corte_seg = EXCLUDED.corte_seg, storage_key = EXCLUDED.storage_key
               RETURNING id`,
              [
                m.titulo || 'Faixa',
                safeFileName(m.artista, m.titulo),
                m.size_bytes ?? 0,
                Math.round((m.duration_ms ?? 0) / 1000),
                m.mix_segundos_finais ?? criacaoConfig.defaultMixSegundos,
                m.storage_key,
                m.musica_id,
              ],
            );
            const musicaIdGw = mg.rows[0].id;

            await gw.query(
              `INSERT INTO playlist_musicas (playlist_id, musica_id, artista_id, ordem)
                 VALUES ($1, $2, $3, $4)
               ON CONFLICT (playlist_id, musica_id) DO UPDATE SET ordem = EXCLUDED.ordem, artista_id = EXCLUDED.artista_id`,
              [playlistId, musicaIdGw, artistaId, ordem],
            );
            ordem++;
            totalMusicas++;
          }
        }

        const cron = await publishCronogramasAndVinhetas(gw, programacaoId, programaId, pastaPlaylistMap);
        totalAgendas = cron.agendas;
        totalVinhetas = cron.vinhetas;

        await gw.query('COMMIT');
      } catch (e) {
        await gw.query('ROLLBACK').catch(() => {});
        const detail = e instanceof Error ? e.message : String(e);
        app.log.error({ err: e, detail }, '[publicar] falhou');
        return reply.code(500).send({ ok: false, error: 'falha_publicacao', detail });
      } finally {
        gw.release();
      }

      return reply.send({
        ok: true,
        playlists: totalPlaylists,
        musicas: totalMusicas,
        semArquivo,
        agendas: totalAgendas,
        vinhetas: totalVinhetas,
      });
    },
  );
}
