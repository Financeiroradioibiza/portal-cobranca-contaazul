import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { getPool } from "../../db/pool.js";
import { criacaoConfig } from "../../criacao/config.js";

function authorized(req: { headers: Record<string, unknown> }): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret) return false;
  const got = String(req.headers["x-criacao-secret"] ?? "");
  if (got.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  } catch {
    return false;
  }
}

type SyncBody = {
  clientes?: Array<{
    id: number;
    nome: string;
    email?: string | null;
    senhaHash?: string | null;
    origemRioLinhaId?: string;
    logotipoBase64?: string | null;
  }>;
  pdvs?: Array<{
    id: number;
    clienteId: number;
    nome: string;
    codigoDisplay?: string;
    origemRioPdvId?: string | null;
    origemRioLinhaId?: string;
    instalacaoToken?: string | null;
    instaladoPlayer?: "N" | "S";
    status?: "A" | "I";
    ctrlPlayer?: "S" | "N";
    ctrlPlacaCarro?: "S" | "N";
    ctrlPlaylists?: "S" | "N";
    cidade?: string;
    uf?: string;
    nomeCompletoContatoExtra?: string;
    programacaoMusical?: string;
    programacaoPortalId?: string | null;
  }>;
};

type SqlPool = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

async function ensurePingLogTable(pool: SqlPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ping_log (
      id BIGSERIAL PRIMARY KEY,
      pdv_id INT NOT NULL,
      ma TEXT,
      ip TEXT,
      versao_player TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => null);
}

/** Histórico imutável de primeiros pings — preservado ao regerar chave. */
async function ensurePrimeiroPingHistoryTable(pool: SqlPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdv_primeiro_ping (
      id BIGSERIAL PRIMARY KEY,
      pdv_id INT NOT NULL,
      pdv_nome TEXT NOT NULL DEFAULT '',
      codigo_display TEXT,
      cliente_id INT NOT NULL,
      cliente_nome TEXT NOT NULL DEFAULT '',
      first_ping_at TIMESTAMPTZ NOT NULL,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => null);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pdv_primeiro_ping_first_ping
      ON pdv_primeiro_ping (first_ping_at DESC)
  `).catch(() => null);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pdv_primeiro_ping_pdv
      ON pdv_primeiro_ping (pdv_id)
  `).catch(() => null);
}

async function archivePrimeiroPingBeforeReset(pool: SqlPool, pdvId: number): Promise<void> {
  await ensurePrimeiroPingHistoryTable(pool);
  await pool.query(
    `INSERT INTO pdv_primeiro_ping (pdv_id, pdv_nome, codigo_display, cliente_id, cliente_nome, first_ping_at, archived_at)
     SELECT
       p.id,
       p.nome,
       p.codigo_display,
       c.id,
       c.nome,
       MIN(pl.created_at),
       now()
     FROM ping_log pl
     INNER JOIN pdvs p ON p.id = pl.pdv_id
     INNER JOIN clientes c ON c.id = p.cliente_id
     WHERE pl.pdv_id = $1
     GROUP BY p.id, p.nome, p.codigo_display, c.id, c.nome`,
    [pdvId],
  ).catch(() => null);
}

async function resolveGatewayProgramaId(
  conn: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ id: number }> }> },
  clienteId: number,
  programacaoPortalId: string | null | undefined,
): Promise<number | null> {
  const portalId = String(programacaoPortalId ?? "").trim();
  if (!portalId) return null;

  const byOrigem = await conn.query(
    `SELECT id FROM programas
      WHERE cliente_id = $1 AND origem_programacao_id = $2
      ORDER BY id LIMIT 1`,
    [clienteId, portalId],
  );
  return byOrigem.rows[0]?.id ?? null;
}

/** Sincroniza clientes/PDVs do portal Neon → gateway MySQL (IDs 100+, 100.001). */
export async function registerPlayerRegistryRoutes(app: FastifyInstance, prefix = "/criacao"): Promise<void> {
  const PLAYER_PREFIX = `${prefix}/player`;
  app.post<{ Body: SyncBody }>(`${PLAYER_PREFIX}/sync-registry`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: "nao_autorizado" });

    const clientes = Array.isArray(req.body?.clientes) ? req.body.clientes : [];
    const pdvs = Array.isArray(req.body?.pdvs) ? req.body.pdvs : [];
    const pool = getPool();
    const conn = await pool.connect();

    try {
      await conn.query("BEGIN");

      await conn.query(`
        CREATE TABLE IF NOT EXISTS clientes (
          id INT PRIMARY KEY,
          nome TEXT NOT NULL DEFAULT '',
          email VARCHAR(200),
          senha_hash TEXT,
          origem_rio_linha_id VARCHAR(64)
        )
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS pdvs (
          id INT PRIMARY KEY,
          cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
          nome TEXT NOT NULL DEFAULT '',
          codigo_display VARCHAR(32),
          origem_rio_pdv_id VARCHAR(64),
          origem_rio_linha_id VARCHAR(64),
          serial_instalacao VARCHAR(64),
          instalado CHAR(1) NOT NULL DEFAULT 'N',
          status CHAR(1) NOT NULL DEFAULT 'A',
          cidade TEXT NOT NULL DEFAULT '',
          uf CHAR(2) NOT NULL DEFAULT '',
          ctrl_player CHAR(1) NOT NULL DEFAULT 'N',
          ctrl_placa_carro CHAR(1) NOT NULL DEFAULT 'N',
          ctrl_playlists CHAR(1) NOT NULL DEFAULT 'N',
          atualizacao_pendente CHAR(1) NOT NULL DEFAULT 'N',
          atualizacao_pendente_agenda CHAR(1) NOT NULL DEFAULT 'N'
        )
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          status CHAR(1) NOT NULL DEFAULT 'A'
        )
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS tokens (
          pdv_id INT PRIMARY KEY REFERENCES pdvs(id) ON DELETE CASCADE,
          token CHAR(32) NOT NULL UNIQUE,
          data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
          data_fim TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'ok'
        )
      `);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS serial_instalacao VARCHAR(64)`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS instalado CHAR(1) NOT NULL DEFAULT 'N'`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS status CHAR(1) NOT NULL DEFAULT 'A'`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS cidade TEXT NOT NULL DEFAULT ''`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS uf CHAR(2) NOT NULL DEFAULT ''`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS ctrl_player CHAR(1) NOT NULL DEFAULT 'N'`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS ctrl_placa_carro CHAR(1) NOT NULL DEFAULT 'N'`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS ctrl_playlists CHAR(1) NOT NULL DEFAULT 'N'`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS atualizacao_pendente CHAR(1) NOT NULL DEFAULT 'N'`);
      await conn.query(
        `ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS atualizacao_pendente_agenda CHAR(1) NOT NULL DEFAULT 'N'`,
      );
      await conn.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS status CHAR(1) NOT NULL DEFAULT 'A'`);
      await conn.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logotipo TEXT NOT NULL DEFAULT ''`);
      await conn.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logotipo_jpeg BYTEA`);
      await conn.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email VARCHAR(200)`);
      await conn.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS senha_hash TEXT`);
      await conn.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS origem_rio_linha_id VARCHAR(64)`);
      await conn.query(
        `ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS nome_completo_contato_extra TEXT NOT NULL DEFAULT ''`,
      );
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS codigo_display VARCHAR(32)`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS origem_rio_pdv_id VARCHAR(64)`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS origem_rio_linha_id VARCHAR(64)`);
      await conn.query(`ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS programa_id INT REFERENCES programas(id) ON DELETE SET NULL`);

      for (const c of clientes) {
        if (!Number.isFinite(c.id) || c.id <= 0) continue;
        let logotipoJpeg: Buffer | null = null;
        const b64 = String(c.logotipoBase64 ?? "").trim();
        if (b64) {
          try {
            const buf = Buffer.from(b64, "base64");
            if (buf.length > 0 && buf.length <= 512_000) logotipoJpeg = buf;
          } catch {
            /* ignora logo inválido */
          }
        }
        await conn.query(
          `INSERT INTO clientes (id, nome, email, senha_hash, origem_rio_linha_id, logotipo_jpeg)
             VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             nome = EXCLUDED.nome,
             email = EXCLUDED.email,
             senha_hash = COALESCE(EXCLUDED.senha_hash, clientes.senha_hash),
             origem_rio_linha_id = EXCLUDED.origem_rio_linha_id,
             logotipo_jpeg = EXCLUDED.logotipo_jpeg`,
          [c.id, c.nome ?? "", c.email ?? null, c.senhaHash ?? null, c.origemRioLinhaId ?? null, logotipoJpeg],
        );

        // Player 5 chama POST /api/login/ → tabela usuarios (contrato legado CakePHP).
        if (c.email && c.senhaHash) {
          await conn.query(
            `INSERT INTO usuarios (cliente_id, email, password_hash, status)
               VALUES ($1, lower(trim($2)), $3, 'A')
             ON CONFLICT (email) DO UPDATE SET
               cliente_id = EXCLUDED.cliente_id,
               password_hash = EXCLUDED.password_hash,
               status = 'A'`,
            [c.id, c.email, c.senhaHash],
          );
        }
      }

      const clienteIds = new Set(clientes.map((c) => c.id));
      for (const p of pdvs) {
        if (!Number.isFinite(p.id) || !Number.isFinite(p.clienteId)) continue;
        /** Lotes 2+ não reenviam clientes — só valida vínculo quando o payload traz clientes. */
        if (clientes.length > 0 && !clienteIds.has(p.clienteId)) continue;
        let instalToken = String(p.instalacaoToken ?? "").trim().slice(0, 32);
        const gwInstalado = p.instaladoPlayer === "S" ? "S" : "N";
        const prev = await conn.query<{ serial_instalacao: string | null; programa_id: number | null }>(
          `SELECT serial_instalacao, programa_id FROM pdvs WHERE id = $1`,
          [p.id],
        );
        if (!instalToken) {
          instalToken = String(prev.rows[0]?.serial_instalacao ?? "").trim().slice(0, 32);
        }
        if (!instalToken) {
          instalToken = crypto.randomBytes(16).toString("hex");
        }
        const tokenChanged =
          prev.rows[0]?.serial_instalacao != null &&
          prev.rows[0].serial_instalacao !== instalToken;

        await conn.query(
          `INSERT INTO pdvs (
             id, cliente_id, nome, codigo_display, origem_rio_pdv_id, origem_rio_linha_id,
             serial_instalacao, instalado, status, cidade, uf,
             ctrl_player, ctrl_placa_carro, ctrl_playlists, nome_completo_contato_extra
           )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             cliente_id = EXCLUDED.cliente_id,
             nome = EXCLUDED.nome,
             codigo_display = EXCLUDED.codigo_display,
             origem_rio_pdv_id = EXCLUDED.origem_rio_pdv_id,
             origem_rio_linha_id = EXCLUDED.origem_rio_linha_id,
             serial_instalacao = EXCLUDED.serial_instalacao,
             status = EXCLUDED.status,
             cidade = EXCLUDED.cidade,
             uf = EXCLUDED.uf,
             ctrl_player = EXCLUDED.ctrl_player,
             ctrl_placa_carro = EXCLUDED.ctrl_placa_carro,
             ctrl_playlists = EXCLUDED.ctrl_playlists,
             nome_completo_contato_extra = EXCLUDED.nome_completo_contato_extra,
             instalado = CASE
               WHEN EXCLUDED.serial_instalacao IS DISTINCT FROM pdvs.serial_instalacao THEN 'N'
               WHEN $16 = 'S' THEN 'S'
               ELSE COALESCE(pdvs.instalado, 'N')
             END`,
          [
            p.id,
            p.clienteId,
            p.nome ?? "",
            p.codigoDisplay ?? null,
            p.origemRioPdvId ?? null,
            p.origemRioLinhaId ?? null,
            instalToken,
            gwInstalado,
            p.status ?? "A",
            p.cidade ?? "",
            (p.uf ?? "").slice(0, 2).toUpperCase(),
            p.ctrlPlayer ?? "N",
            p.ctrlPlacaCarro ?? "N",
            p.ctrlPlaylists ?? "N",
            String(p.nomeCompletoContatoExtra ?? "").trim().slice(0, 32),
            gwInstalado,
          ],
        );

        await conn.query(
          `INSERT INTO tokens (pdv_id, token, data_inicio, status)
             VALUES ($1, $2, now(), 'ok')
           ON CONFLICT (pdv_id) DO UPDATE SET
             token = EXCLUDED.token,
             data_inicio = now(),
             status = 'ok'`,
          [p.id, instalToken],
        );
        if (tokenChanged) {
          await conn.query(`UPDATE pdvs SET instalado = 'N' WHERE id = $1`, [p.id]);
        } else if (gwInstalado === "S") {
          await conn.query(`UPDATE pdvs SET instalado = 'S' WHERE id = $1`, [p.id]);
        }

        const programaId = await resolveGatewayProgramaId(conn, p.clienteId, p.programacaoPortalId);
        const prevProgramaId = prev.rows[0]?.programa_id ?? null;
        if (programaId != null) {
          await conn.query(`UPDATE pdvs SET programa_id = $1 WHERE id = $2`, [programaId, p.id]);
          if (programaId !== prevProgramaId) {
            await conn.query(
              `UPDATE pdvs SET atualizacao_pendente = 'S', atualizacao_pendente_agenda = 'S' WHERE id = $1`,
              [p.id],
            );
          }
        }
      }

      await conn.query("COMMIT");
      return reply.send({ ok: true, clientes: clientes.length, pdvs: pdvs.length });
    } catch (e) {
      await conn.query("ROLLBACK").catch(() => {});
      const detail = e instanceof Error ? e.message : String(e);
      app.log.error({ err: e }, "[player/sync-registry] falhou");
      return reply.code(500).send({ ok: false, error: "sync_falhou", detail });
    } finally {
      conn.release();
    }
  });

  /** Após publicar programação — Player 5 lê atualizacao_pendente no ping e refaz /playlist/. */
  app.post<{ Body: { clienteId?: number; pdvIds?: number[] } }>(`${PLAYER_PREFIX}/signal-atualizacao`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: "nao_autorizado" });
    const clienteId = Number(req.body?.clienteId);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return reply.code(400).send({ ok: false, error: "parametros_invalidos" });
    }
    const pdvIdsRaw = Array.isArray(req.body?.pdvIds) ? req.body.pdvIds : [];
    const pdvIds = pdvIdsRaw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    const pool = getPool();
    const r =
      pdvIds.length > 0 ?
        await pool.query(
          `UPDATE pdvs SET atualizacao_pendente = 'S', atualizacao_pendente_agenda = 'S' WHERE id = ANY($1::int[])`,
          [pdvIds],
        )
      : await pool.query(
          `UPDATE pdvs SET atualizacao_pendente = 'S', atualizacao_pendente_agenda = 'S' WHERE cliente_id = $1`,
          [clienteId],
        );
    return reply.send({ ok: true, pdvs: r.rowCount ?? 0 });
  });

  /** Login cliente Player 5 — email + senha → cliente id + lista PDVs. */
  app.post<{ Body: { email?: string; password?: string } }>(
    `${PLAYER_PREFIX}/login`,
    async (req, reply) => {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      if (!email || !password) return reply.code(400).send({ ok: false, error: "parametros_invalidos" });

      const pool = getPool();
      const r = await pool.query<{ id: number; nome: string; senha_hash: string | null }>(
        `SELECT id, nome, senha_hash FROM clientes WHERE lower(trim(email)) = $1 LIMIT 1`,
        [email],
      );
      if (r.rowCount === 0 || !r.rows[0]?.senha_hash) {
        return reply.code(401).send({ ok: false, error: "credenciais_invalidas" });
      }

      const bcrypt = await import("bcryptjs").catch(() => null);
      if (!bcrypt) return reply.code(503).send({ ok: false, error: "bcrypt_indisponivel" });
      const ok = await bcrypt.compare(password, r.rows[0].senha_hash);
      if (!ok) return reply.code(401).send({ ok: false, error: "credenciais_invalidas" });

      const cliente = r.rows[0];
      const pdvs = await pool.query<{ id: number; nome: string; codigo_display: string | null }>(
        `SELECT id, nome, codigo_display FROM pdvs WHERE cliente_id = $1 ORDER BY id`,
        [cliente.id],
      );

      return reply.send({
        ok: true,
        cliente: { id: cliente.id, nome: cliente.nome },
        pdvs: pdvs.rows.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo: p.codigo_display ?? String(p.id),
        })),
      });
    },
  );

  /** Lista PDVs de um cliente (após login). */
  app.get<{ Querystring: { clienteId?: string } }>(`${PLAYER_PREFIX}/pdvs`, async (req, reply) => {
    const clienteId = Number(req.query?.clienteId);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return reply.code(400).send({ ok: false, error: "parametros_invalidos" });
    }
    const pool = getPool();
    const pdvs = await pool.query<{ id: number; nome: string; codigo_display: string | null }>(
      `SELECT id, nome, codigo_display FROM pdvs WHERE cliente_id = $1 ORDER BY id`,
      [clienteId],
    );
    return reply.send({ ok: true, pdvs: pdvs.rows });
  });

  /** Telemetria Player 5 para o portal (ping + cache). Portal → cloud2, nunca direto do player. */
  app.post<{ Body: { pdvIds?: number[] } }>(`${PLAYER_PREFIX}/telemetry`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: "nao_autorizado" });

    const pdvIdsRaw = Array.isArray(req.body?.pdvIds) ? req.body.pdvIds : [];
    const pdvIds = [...new Set(pdvIdsRaw.map((id) => Math.trunc(Number(id))).filter((id) => id > 0))];
    if (pdvIds.length === 0) {
      return reply.send({ ok: true, pdvs: [], pingsToday: 0 });
    }

    const pool = getPool();

    await ensurePingLogTable(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS atualizadas (
        id SERIAL PRIMARY KEY,
        pdv_id INT NOT NULL,
        musica_id INT NOT NULL,
        programa_id INT NOT NULL DEFAULT 0,
        percentual INT NOT NULL DEFAULT 100,
        playlist_atualizada CHAR(1) NOT NULL DEFAULT 'S',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (pdv_id, musica_id, programa_id)
      )
    `).catch(() => null);

    const pingsTodayRes = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ping_log
        WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`,
    ).catch(() => ({ rows: [{ n: "0" }] }));

    const stats = await pool.query<{
      pdv_id: number;
      first_ping_at: Date | null;
      last_ping_at: Date | null;
      player_version: string | null;
      download_percent: number | null;
    }>(
      `WITH targets AS (
         SELECT unnest($1::int[]) AS pdv_id
       ),
       ping_stats AS (
         SELECT
           pl.pdv_id,
           MIN(pl.created_at) AS first_ping_at,
           MAX(pl.created_at) AS last_ping_at,
           (ARRAY_AGG(NULLIF(trim(pl.versao_player), '') ORDER BY pl.created_at DESC))[1] AS player_version
         FROM ping_log pl
         INNER JOIN targets t ON t.pdv_id = pl.pdv_id
         GROUP BY pl.pdv_id
       ),
       cache_stats AS (
         SELECT
           p.id AS pdv_id,
           CASE
             WHEN COALESCE(tot.total_musicas, 0) = 0 THEN NULL
             ELSE ROUND(100.0 * COALESCE(dlv.baixadas, 0) / tot.total_musicas)::int
           END AS download_percent
         FROM pdvs p
         INNER JOIN targets t ON t.pdv_id = p.id
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT pm.musica_id)::int AS total_musicas
           FROM playlists pl
           INNER JOIN playlist_musicas pm ON pm.playlist_id = pl.id
           WHERE pl.programa_id = p.programa_id
             AND pl.tipo = 'N'
             AND COALESCE(pl.publicado, 'S') = 'S'
             AND (pl.pdv_id IS NULL OR pl.pdv_id = p.id)
         ) tot ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT a.musica_id)::int AS baixadas
           FROM atualizadas a
           WHERE a.pdv_id = p.id
             AND a.programa_id = COALESCE(p.programa_id, 0)
             AND a.percentual >= 100
         ) dlv ON true
       )
       SELECT
         t.pdv_id,
         ps.first_ping_at,
         ps.last_ping_at,
         ps.player_version,
         cs.download_percent
       FROM targets t
       LEFT JOIN ping_stats ps ON ps.pdv_id = t.pdv_id
       LEFT JOIN cache_stats cs ON cs.pdv_id = t.pdv_id
       ORDER BY t.pdv_id`,
      [pdvIds],
    ).catch(() => ({ rows: [] as Array<{
      pdv_id: number;
      first_ping_at: Date | null;
      last_ping_at: Date | null;
      player_version: string | null;
      download_percent: number | null;
    }> }));

    return reply.send({
      ok: true,
      pingsToday: Number(pingsTodayRes.rows[0]?.n ?? 0) || 0,
      pdvs: stats.rows.map((r) => ({
        pdvId: r.pdv_id,
        firstPingAt: r.first_ping_at?.toISOString() ?? null,
        lastPingAt: r.last_ping_at?.toISOString() ?? null,
        playerVersion: r.player_version,
        downloadPercent: r.download_percent,
      })),
    });
  });

  /** Zera telemetria após regerar token no suporte (ping, cache, instalado). */
  app.post<{ Body: { pdvId?: number } }>(`${PLAYER_PREFIX}/reset-instalacao`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: "nao_autorizado" });

    const pdvId = Math.trunc(Number(req.body?.pdvId));
    if (!Number.isFinite(pdvId) || pdvId <= 0) {
      return reply.code(400).send({ ok: false, error: "parametros_invalidos" });
    }

    const pool = getPool();
    await ensurePingLogTable(pool);
    await archivePrimeiroPingBeforeReset(pool, pdvId);
    await pool.query(`DELETE FROM ping_log WHERE pdv_id = $1`, [pdvId]).catch(() => null);
    await pool.query(`DELETE FROM atualizadas WHERE pdv_id = $1`, [pdvId]).catch(() => null);
    await pool.query(`UPDATE pdvs SET instalado = 'N' WHERE id = $1`, [pdvId]).catch(() => null);

    return reply.send({ ok: true, pdvId });
  });

  /** Quais IDs do portal já existem no gateway (sync). Com `details: true` devolve programa amarrado. */
  app.post<{ Body: { pdvIds?: number[]; clienteIds?: number[]; details?: boolean } }>(
    `${PLAYER_PREFIX}/registry-check`,
    async (req, reply) => {
      if (!authorized(req)) return reply.code(401).send({ ok: false, error: "nao_autorizado" });

      const pdvIds = [
        ...new Set(
          (Array.isArray(req.body?.pdvIds) ? req.body.pdvIds : [])
            .map((id) => Math.trunc(Number(id)))
            .filter((id) => id > 0),
        ),
      ];
      const clienteIds = [
        ...new Set(
          (Array.isArray(req.body?.clienteIds) ? req.body.clienteIds : [])
            .map((id) => Math.trunc(Number(id)))
            .filter((id) => id > 0),
        ),
      ];
      const withDetails = req.body?.details === true;

      const pool = getPool();
      let syncedPdvIds: number[] = [];
      let syncedClienteIds: number[] = [];
      let pdvDetails: Array<{
        id: number;
        programaId: number | null;
        origemProgramacaoId: string | null;
        programaNome: string | null;
        atualizacaoPendente: string | null;
      }> = [];

      if (pdvIds.length > 0) {
        if (withDetails) {
          const r = await pool.query<{
            id: number;
            programa_id: number | null;
            origem_programacao_id: string | null;
            programa_nome: string | null;
            atualizacao_pendente: string | null;
          }>(
            `SELECT p.id, p.programa_id, p.atualizacao_pendente,
                    pr.nome AS programa_nome, pr.origem_programacao_id
               FROM pdvs p
               LEFT JOIN programas pr ON pr.id = p.programa_id
              WHERE p.id = ANY($1::int[])
              ORDER BY p.id`,
            [pdvIds],
          );
          syncedPdvIds = r.rows.map((row) => row.id);
          pdvDetails = r.rows.map((row) => ({
            id: row.id,
            programaId: row.programa_id,
            origemProgramacaoId: row.origem_programacao_id,
            programaNome: row.programa_nome,
            atualizacaoPendente: row.atualizacao_pendente,
          }));
        } else {
          const r = await pool.query<{ id: number }>(`SELECT id FROM pdvs WHERE id = ANY($1::int[])`, [
            pdvIds,
          ]);
          syncedPdvIds = r.rows.map((row) => row.id);
        }
      }
      if (clienteIds.length > 0) {
        const r = await pool.query<{ id: number }>(
          `SELECT id FROM clientes WHERE id = ANY($1::int[])`,
          [clienteIds],
        );
        syncedClienteIds = r.rows.map((row) => row.id);
      }

      return reply.send({ ok: true, syncedPdvIds, syncedClienteIds, pdvDetails });
    },
  );

  /** PDVs que já fizeram pelo menos um ping (primeiro ping registrado). */
  app.get(`${PLAYER_PREFIX}/first-pings`, async (req, reply) => {
    if (!authorized(req)) return reply.code(401).send({ ok: false, error: "nao_autorizado" });

    const pool = getPool();

    await ensurePingLogTable(pool);
    await ensurePrimeiroPingHistoryTable(pool);

    const rows = await pool.query<{
      row_id: string;
      pdv_id: number;
      pdv_nome: string;
      codigo_display: string | null;
      cliente_id: number;
      cliente_nome: string;
      first_ping_at: Date;
      ativo: boolean;
    }>(
      `SELECT row_id, pdv_id, pdv_nome, codigo_display, cliente_id, cliente_nome, first_ping_at, ativo
       FROM (
         SELECT
           ('hist-' || h.id::text) AS row_id,
           h.pdv_id,
           h.pdv_nome,
           h.codigo_display,
           h.cliente_id,
           h.cliente_nome,
           h.first_ping_at,
           false AS ativo
         FROM pdv_primeiro_ping h
         UNION ALL
         SELECT
           ('live-' || p.id::text) AS row_id,
           p.id AS pdv_id,
           p.nome AS pdv_nome,
           p.codigo_display,
           c.id AS cliente_id,
           c.nome AS cliente_nome,
           MIN(pl.created_at) AS first_ping_at,
           true AS ativo
         FROM ping_log pl
         INNER JOIN pdvs p ON p.id = pl.pdv_id
         INNER JOIN clientes c ON c.id = p.cliente_id
         GROUP BY p.id, p.nome, p.codigo_display, c.id, c.nome
       ) combined
       ORDER BY first_ping_at DESC`,
    ).catch(() => ({ rows: [] as Array<{
      row_id: string;
      pdv_id: number;
      pdv_nome: string;
      codigo_display: string | null;
      cliente_id: number;
      cliente_nome: string;
      first_ping_at: Date;
      ativo: boolean;
    }> }));

    return reply.send({
      ok: true,
      rows: rows.rows.map((r) => ({
        rowId: r.row_id,
        pdvId: r.pdv_id,
        pdvNome: r.pdv_nome,
        codigoDisplay: r.codigo_display,
        clienteId: r.cliente_id,
        clienteNome: r.cliente_nome,
        firstPingAt: r.first_ping_at.toISOString(),
        ativo: r.ativo,
      })),
    });
  });
}
