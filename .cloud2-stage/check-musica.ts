import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { analyzeCheckSession } from '../../criacao/checkAnalyze.js';
import {
  appendCheckManifestEntry,
  deleteCheckSession,
  ensureCheckScratchDirs,
  checkFilePath,
  checkSessionDir,
  isValidCheckFileId,
  isValidCheckSessionId,
  listCheckSessionFiles,
} from '../../criacao/checkStorage.js';
import { verifyCheckIngestToken, verifyCheckAnalyzeToken, verifyCheckStreamToken } from '../../criacao/ingestToken.js';
import { sendAudioReply } from '../../criacao/audioDelivery.js';
import { criacaoConfig } from '../../criacao/config.js';

function authSecret(req: { headers: Record<string, unknown> }): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret) return false;
  const header = String(req.headers['x-criacao-secret'] ?? '').trim();
  return header === secret;
}

function extFromFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.mp3' || ext === '.m4a' || ext === '.wav' || ext === '.flac') return ext;
  return '.mp3';
}

/** CHECK musical — scratch temporário, sem pipeline de upload. */
export async function registerCheckMusicaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  if (!app.hasDecorator('multipartErrors')) {
    const multipart = await import('@fastify/multipart');
    await app.register(multipart.default, {
      limits: { fileSize: criacaoConfig.maxUploadBytes, files: 1, fields: 10 },
    });
  }

  app.post(`${prefix}/check/session`, async (req, reply) => {
    if (!authSecret(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    ensureCheckScratchDirs();
    const sessionId = crypto.randomUUID();
    const dir = checkSessionDir(sessionId);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ sessionId, files: [], createdAt: new Date().toISOString() }),
    );
    return reply.send({ ok: true, sessionId });
  });

  app.post(`${prefix}/check/ingest`, async (req, reply) => {
    let token = '';
    let fileBuffer: Buffer | null = null;
    let fileName = 'check.mp3';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'token') {
        token = String(part.value ?? '').trim();
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileName = part.filename || fileName;
        fileBuffer = await part.toBuffer();
      }
    }

    const parsed = verifyCheckIngestToken(token);
    if (!parsed) return reply.code(401).send({ ok: false, error: 'token_invalido' });
    if (!fileBuffer?.length) return reply.code(400).send({ ok: false, error: 'arquivo_ausente' });

    ensureCheckScratchDirs();
    const ext = extFromFilename(fileName);
    const dest = checkFilePath(parsed.sessionId, parsed.fileId, ext);
    await fsp.mkdir(checkSessionDir(parsed.sessionId), { recursive: true });
    await fsp.writeFile(dest, fileBuffer);
    appendCheckManifestEntry(parsed.sessionId, {
      fileId: parsed.fileId,
      arquivoNome: fileName.slice(0, 500),
      ext,
    });

    return reply.send({
      ok: true,
      sessionId: parsed.sessionId,
      fileId: parsed.fileId,
      bytes: fileBuffer.length,
    });
  });

  app.post(`${prefix}/check/analyze`, async (req, reply) => {
    const body = (req.body ?? {}) as {
      sessionId?: string;
      fileId?: string;
      fileIds?: string[];
      analyzeToken?: string;
      pastaTracks?: Array<{ musicaId?: string; artista?: string; titulo?: string; durationMs?: number | null }>;
    };
    const sessionId = String(body.sessionId ?? '').trim();
    const portalAuth = authSecret(req);
    const tokenAuth = verifyCheckAnalyzeToken(String(body.analyzeToken ?? '').trim());
    if (!portalAuth && !tokenAuth) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    if (tokenAuth && tokenAuth.sessionId !== sessionId) {
      return reply.code(401).send({ ok: false, error: 'token_sessao_invalido' });
    }
    if (!isValidCheckSessionId(sessionId)) {
      return reply.code(400).send({ ok: false, error: 'session_id_invalido' });
    }
    const fileId = String(body.fileId ?? '').trim();
    if (fileId && !isValidCheckFileId(fileId)) {
      return reply.code(400).send({ ok: false, error: 'file_id_invalido' });
    }
    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.map((id) => String(id ?? '').trim()).filter((id) => isValidCheckFileId(id))
      : [];
    if (fileIds.length > 15) {
      return reply.code(400).send({ ok: false, error: 'lote_grande' });
    }
    const pastaTracks = Array.isArray(body.pastaTracks)
      ? body.pastaTracks
          .map((t) => ({
            musicaId: String(t.musicaId ?? '').trim(),
            artista: String(t.artista ?? '').trim(),
            titulo: String(t.titulo ?? '').trim(),
            durationMs: t.durationMs ?? null,
          }))
          .filter((t) => t.musicaId)
      : [];
    const files = listCheckSessionFiles(sessionId);
    const results = await analyzeCheckSession({
      sessionId,
      files,
      pastaTracks,
      fileId: fileId || undefined,
      fileIds: fileIds.length > 0 ? fileIds : undefined,
    });
    return reply.send({ ok: true, results });
  });

  app.delete<{ Params: { sessionId: string } }>(`${prefix}/check/session/:sessionId`, async (req, reply) => {
    if (!authSecret(req)) return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    const sessionId = String(req.params.sessionId ?? '').trim();
    if (!isValidCheckSessionId(sessionId)) {
      return reply.code(400).send({ ok: false, error: 'session_id_invalido' });
    }
    await deleteCheckSession(sessionId).catch(() => undefined);
    return reply.send({ ok: true });
  });

  app.get<{
    Params: { sessionId: string; fileId: string };
    Querystring: { exp?: string; token?: string };
  }>(`${prefix}/check-audio/:sessionId/:fileId`, async (req, reply) => {
    const sessionId = String(req.params.sessionId ?? '').trim();
    const fileId = String(req.params.fileId ?? '').trim();
    const exp = Number(req.query.exp);
    const sig = String(req.query.token ?? '').trim();
    if (!isValidCheckSessionId(sessionId) || !isValidCheckFileId(fileId)) {
      return reply.code(400).send({ ok: false, error: 'parametros_invalidos' });
    }
    if (!verifyCheckStreamToken(sessionId, fileId, exp, sig)) {
      return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
    }

    const files = listCheckSessionFiles(sessionId);
    const meta = files.find((f) => f.fileId === fileId);
    const ext = meta?.ext || '.mp3';
    const filePath = checkFilePath(sessionId, fileId, ext);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

    return sendAudioReply(
      reply,
      { filePath, mp3Buffer: null, contentLength: stat.size },
      req.headers.range,
      'private, max-age=3600',
    );
  });
}
