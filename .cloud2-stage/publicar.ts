import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
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
        app.log.error({ err: e }, '[publicar] falhou');
        return reply.code(500).send({ ok: false, error: 'falha_publicacao' });
      } finally {
        gw.release();
      }

      try {
        const pool = getPool();
        await pool.query(
          `UPDATE pdvs SET atualizacao_pendente = 'S', atualizacao_pendente_agenda = 'S' WHERE cliente_id = $1`,
          [clienteId],
        );
      } catch {
        try {
          await getPool().query(`UPDATE pdvs SET atualizacao_pendente = 'S' WHERE cliente_id = $1`, [clienteId]);
        } catch {
          /* colunas podem não existir ainda */
        }
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
