import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import https from 'node:https';
import { criacaoConfig } from '../../criacao/config.js';
import { collectOpsStorageSnapshot } from '../../criacao/opsStorage.js';
import { collectOrphanStorageReport } from '../../criacao/orphanStorage.js';
import { runB2StorageAudit, verifyMusicaOnB2 } from '../../criacao/b2Audit.js';

const DANFSE_PDF_HEADERS = {
  Accept: 'application/pdf,application/octet-stream,*/*',
  'User-Agent': 'Mozilla/5.0 (compatible; RadioIbizaCloud2/1.0)',
  Referer: 'https://app.contaazul.com/',
};

function fetchHttpsPdf(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: DANFSE_PDF_HEADERS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchHttpsPdf(res.headers.location).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length >= 500 && buf.subarray(0, 5).toString() === '%PDF-') resolve(buf);
        else resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(25_000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function fetchContaAzulDanfsePdf(vendaId: string): Promise<Buffer | null> {
  const url = `https://app.contaazul.com/pub/rest/billing-data/service-invoice/${encodeURIComponent(vendaId)}/pdf`;
  return fetchHttpsPdf(url);
}

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

/** GET /criacao/ops/storage — disco NVMe + buckets R2/B2 (autenticado). */
export async function registerOpsStorageRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get(`${prefix}/ops/storage`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    try {
      const snapshot = await collectOpsStorageSnapshot();
      return reply.send(snapshot);
    } catch (e) {
      app.log.error(e, '[ops/storage]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });

  app.get<{ Querystring: { limit?: string } }>(`${prefix}/ops/b2-audit`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    try {
      const limitRaw = req.query.limit;
      const limitParsed = limitRaw != null ? Number(limitRaw) : NaN;
      const report = await runB2StorageAudit(
        Number.isFinite(limitParsed) && limitParsed > 0 ? { limit: limitParsed } : undefined,
      );
      return reply.send(report);
    } catch (e) {
      app.log.error(e, '[ops/b2-audit]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });

  app.get<{ Params: { musicaId: string } }>(
    `${prefix}/ops/b2-verify/:musicaId`,
    async (req, reply) => {
      if (!authorized(req)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }
      const musicaId = String(req.params.musicaId ?? '').trim();
      if (!musicaId) return reply.code(400).send({ ok: false, error: 'id_obrigatorio' });
      try {
        const report = await verifyMusicaOnB2(musicaId);
        const verifiedOk = report.master.ok && report.uso128.ok;
        return reply.send({ ...report, ok: verifiedOk });
      } catch (e) {
        app.log.error(e, '[ops/b2-verify]');
        return reply.code(500).send({
          ok: false,
          error: e instanceof Error ? e.message : 'erro',
        });
      }
    },
  );

  /** Proxy DANFSE (Netlify não alcança app.contaazul.com de forma confiável). */
  app.get<{ Querystring: { vendaId?: string } }>(`${prefix}/ops/danfse-pdf`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    const vendaId = String(req.query.vendaId ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(vendaId)) {
      return reply.code(400).send({ ok: false, error: 'vendaId_invalido' });
    }
    try {
      let buf: Buffer | null = null;
      for (let attempt = 0; attempt < 3 && !buf; attempt++) {
        buf = await fetchContaAzulDanfsePdf(vendaId);
        if (!buf && attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      if (!buf) {
        return reply.code(502).send({ ok: false, error: 'danfse_indisponivel' });
      }
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Cache-Control', 'no-store')
        .send(buf);
    } catch (e) {
      app.log.error(e, '[ops/danfse-pdf]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });

  app.get(`${prefix}/ops/orphans`, async (req, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }
    try {
      const report = await collectOrphanStorageReport();
      return reply.send(report);
    } catch (e) {
      app.log.error(e, '[ops/orphans]');
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : 'erro',
      });
    }
  });
}
