import type { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { criacaoConfig } from '../../criacao/config.js';
import { produceVinhetaMp3, mixVinhetaVoiceWithBed } from '../../criacao/ffmpeg.js';
import { verifyVinhetaStreamAccess, verifyVinhetaToken } from '../../criacao/ingestToken.js';
import { portalQuery } from '../../criacao/portalDb.js';
import { resolveUsoAudio, sendAudioReply } from '../../criacao/audioDelivery.js';
import { ensureStorageDirs, vinhetaPath, vinhetaStorageKey, vinhetaTrilhaPath, vinhetaTrilhaStorageKey } from '../../criacao/storage.js';

const MAX_VINHETA_BYTES = Number(process.env.CRIACAO_MAX_VINHETA_BYTES ?? String(20 * 1024 * 1024));

type VinhetaAudioParams = { vinhetaId: string };
type VinhetaTrilhaAudioParams = { trilhaId: string };
type VinhetaAudioQuery = { exp?: string; token?: string };

/** Upload e preview de vinhetas de áudio (spots) — direto no cloud2. */
export async function registerVinhetaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  if (!app.hasDecorator('multipartErrors')) {
    const multipart = await import('@fastify/multipart');
    await app.register(multipart.default, {
      limits: { fileSize: Math.min(criacaoConfig.maxUploadBytes, MAX_VINHETA_BYTES), files: 1, fields: 10 },
    });
  }

  app.post(`${prefix}/vinheta-ingest`, async (req, reply) => {
    let token = '';
    let fileBuffer: Buffer | null = null;
    let fileName = 'vinheta.mp3';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'token') {
        token = String(part.value ?? '').trim();
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileName = part.filename || fileName;
        fileBuffer = await part.toBuffer();
      }
    }

    if (!token) return reply.code(400).send({ ok: false, error: 'token_ausente' });
    const parsed = verifyVinhetaToken(token);
    if (!parsed) return reply.code(401).send({ ok: false, error: 'token_invalido' });
    if (!fileBuffer?.length) return reply.code(400).send({ ok: false, error: 'arquivo_ausente' });

    const ext = path.extname(fileName).toLowerCase();
    if (ext && ext !== '.mp3') {
      return reply.code(400).send({ ok: false, error: 'formato_invalido' });
    }

    const vinhetaRes = await portalQuery<{ id: string; tipo: string }>(
      `SELECT id, tipo::text AS tipo FROM vinheta WHERE id = $1 LIMIT 1`,
      [parsed.vinhetaId],
    );
    const vinheta = vinhetaRes.rows[0];
    if (!vinheta) return reply.code(404).send({ ok: false, error: 'vinheta_nao_encontrada' });

    ensureStorageDirs();
    const dest = vinhetaPath(parsed.vinhetaId);
    const scratch = path.join(criacaoConfig.storageRoot, 'work', `vinheta-upload-${parsed.vinhetaId}.mp3`);
    await fsp.mkdir(path.dirname(scratch), { recursive: true });
    await fsp.writeFile(scratch, fileBuffer);
    try {
      const { durationMs } = await produceVinhetaMp3(scratch, dest);
      app.log.info({ vinhetaId: parsed.vinhetaId, durationMs }, '[vinheta-ingest] lufs ok');
    } finally {
      await fsp.unlink(scratch).catch(() => null);
    }

    const key = vinhetaStorageKey(parsed.vinhetaId);
    await portalQuery(
      `UPDATE vinheta
          SET storage_key = $2, updated_at = now()
        WHERE id = $1`,
      [parsed.vinhetaId, key],
    );

    app.log.info(
      { vinhetaId: parsed.vinhetaId, fileName, bytes: fileBuffer.length, tipo: vinheta.tipo },
      '[vinheta-ingest] ok',
    );
    return reply.send({ ok: true, vinhetaId: parsed.vinhetaId, bytes: fileBuffer.length, storageKey: key });
  });

  app.post(`${prefix}/vinheta-trilha-ingest`, async (req, reply) => {
    let token = '';
    let fileBuffer: Buffer | null = null;
    let fileName = 'trilha.mp3';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'token') {
        token = String(part.value ?? '').trim();
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileName = part.filename || fileName;
        fileBuffer = await part.toBuffer();
      }
    }

    if (!token) return reply.code(400).send({ ok: false, error: 'token_ausente' });
    const parsed = verifyVinhetaToken(token);
    if (!parsed) return reply.code(401).send({ ok: false, error: 'token_invalido' });
    if (!fileBuffer?.length) return reply.code(400).send({ ok: false, error: 'arquivo_ausente' });

    const ext = path.extname(fileName).toLowerCase();
    if (ext && ext !== '.mp3') {
      return reply.code(400).send({ ok: false, error: 'formato_invalido' });
    }

    const trilhaRes = await portalQuery<{ id: string }>(
      `SELECT id FROM vinheta_trilha WHERE id = $1 LIMIT 1`,
      [parsed.vinhetaId],
    );
    if (!trilhaRes.rows[0]) return reply.code(404).send({ ok: false, error: 'trilha_nao_encontrada' });

    ensureStorageDirs();
    const dest = vinhetaTrilhaPath(parsed.vinhetaId);
    const scratch = path.join(criacaoConfig.storageRoot, 'work', `vinheta-trilha-upload-${parsed.vinhetaId}.mp3`);
    await fsp.mkdir(path.dirname(scratch), { recursive: true });
    await fsp.writeFile(scratch, fileBuffer);
    let durationMs = 0;
    try {
      const produced = await produceVinhetaMp3(scratch, dest);
      durationMs = produced.durationMs;
    } finally {
      await fsp.unlink(scratch).catch(() => null);
    }

    const key = vinhetaTrilhaStorageKey(parsed.vinhetaId);
    await portalQuery(
      `UPDATE vinheta_trilha
          SET storage_key = $2, duration_ms = $3, updated_at = now()
        WHERE id = $1`,
      [parsed.vinhetaId, key, durationMs || null],
    );

    return reply.send({ ok: true, trilhaId: parsed.vinhetaId, bytes: fileBuffer.length, storageKey: key, durationMs });
  });

  app.get<{ Params: VinhetaTrilhaAudioParams; Querystring: VinhetaAudioQuery }>(
    `${prefix}/vinheta-trilha-audio/:trilhaId`,
    async (req, reply) => {
      const trilhaId = String(req.params.trilhaId ?? '').trim();
      const exp = Number(req.query.exp);
      const sig = String(req.query.token ?? '').trim();

      if (!trilhaId || !verifyVinhetaStreamAccess(trilhaId, exp, sig)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      const r = await portalQuery<{ storage_key: string | null }>(
        `SELECT storage_key FROM vinheta_trilha WHERE id = $1 LIMIT 1`,
        [trilhaId],
      );
      const key = r.rows[0]?.storage_key;
      if (!key) return reply.code(404).send({ ok: false, error: 'audio_ausente' });

      const resolved = await resolveUsoAudio(key);
      if (!resolved) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

      return sendAudioReply(reply, resolved, req.headers.range, 'private, max-age=3600');
    },
  );

  app.get<{ Params: VinhetaAudioParams; Querystring: VinhetaAudioQuery }>(
    `${prefix}/vinheta-audio/:vinhetaId`,
    async (req, reply) => {
      const vinhetaId = String(req.params.vinhetaId ?? '').trim();
      const exp = Number(req.query.exp);
      const sig = String(req.query.token ?? '').trim();

      if (!vinhetaId || !verifyVinhetaStreamAccess(vinhetaId, exp, sig)) {
        return reply.code(401).send({ ok: false, error: 'nao_autorizado' });
      }

      const r = await portalQuery<{ storage_key: string | null }>(
        `SELECT storage_key FROM vinheta WHERE id = $1 LIMIT 1`,
        [vinhetaId],
      );
      const key = r.rows[0]?.storage_key;
      if (!key) return reply.code(404).send({ ok: false, error: 'audio_ausente' });

      const resolved = await resolveUsoAudio(key);
      if (!resolved) return reply.code(404).send({ ok: false, error: 'arquivo_ausente' });

      return sendAudioReply(reply, resolved, req.headers.range, 'private, max-age=3600');
    },
  );

  app.post(`${prefix}/vinheta-ia-mix`, async (req, reply) => {
    let token = '';
    let trilhaMusicaId = '';
    let trilhaVinhetaId = '';
    let voiceBuffer: Buffer | null = null;

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'token') {
        token = String(part.value ?? '').trim();
      } else if (part.type === 'field' && part.fieldname === 'trilhaMusicaId') {
        trilhaMusicaId = String(part.value ?? '').trim();
      } else if (part.type === 'field' && part.fieldname === 'trilhaVinhetaId') {
        trilhaVinhetaId = String(part.value ?? '').trim();
      } else if (part.type === 'file' && part.fieldname === 'voice') {
        voiceBuffer = await part.toBuffer();
      }
    }

    if (!token) return reply.code(400).send({ ok: false, error: 'token_ausente' });
    const parsed = verifyVinhetaToken(token);
    if (!parsed) return reply.code(401).send({ ok: false, error: 'token_invalido' });
    if (!voiceBuffer?.length) return reply.code(400).send({ ok: false, error: 'voice_ausente' });
    if (!trilhaMusicaId && !trilhaVinhetaId) return reply.code(400).send({ ok: false, error: 'trilha_obrigatoria' });

    let bedKey: string | null = null;
    if (trilhaVinhetaId) {
      const trilhaRes = await portalQuery<{ storage_key: string | null }>(
        `SELECT storage_key FROM vinheta_trilha WHERE id = $1 LIMIT 1`,
        [trilhaVinhetaId],
      );
      bedKey = trilhaRes.rows[0]?.storage_key ?? null;
    } else {
      const trilhaRes = await portalQuery<{ storage_key: string }>(
        `SELECT storage_key FROM musica_versao WHERE musica_id = $1 AND storage_key IS NOT NULL ORDER BY formato ASC LIMIT 1`,
        [trilhaMusicaId],
      );
      bedKey = trilhaRes.rows[0]?.storage_key ?? null;
    }
    if (!bedKey) return reply.code(404).send({ ok: false, error: 'trilha_ausente' });

    const bedResolved = await resolveUsoAudio(bedKey);
    if (!bedResolved) return reply.code(404).send({ ok: false, error: 'trilha_arquivo_ausente' });

    ensureStorageDirs();
    const workDir = path.join(criacaoConfig.storageRoot, 'work', `vinheta-ia-${parsed.vinhetaId}`);
    await fsp.mkdir(workDir, { recursive: true });
    const voicePath = path.join(workDir, 'voice.mp3');
    const bedPath = path.join(workDir, 'bed.mp3');
    const dest = vinhetaPath(parsed.vinhetaId);

    await fsp.writeFile(voicePath, voiceBuffer);
    if (bedResolved.mp3Buffer) {
      await fsp.writeFile(bedPath, bedResolved.mp3Buffer);
    } else {
      await fsp.copyFile(bedResolved.filePath, bedPath);
    }

    try {
      const { durationMs } = await mixVinhetaVoiceWithBed(voicePath, bedPath, dest);
      app.log.info({ vinhetaId: parsed.vinhetaId, durationMs }, '[vinheta-ia-mix] ok');
    } finally {
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => null);
    }

    const key = vinhetaStorageKey(parsed.vinhetaId);
    await portalQuery(
      `UPDATE vinheta SET storage_key = $2, updated_at = now() WHERE id = $1`,
      [parsed.vinhetaId, key],
    );
    return reply.send({ ok: true, vinhetaId: parsed.vinhetaId, storageKey: key });
  });

  app.post<{ Body: { token?: string; sourceVinhetaId?: string; targetVinhetaId?: string } }>(
    `${prefix}/vinheta-clone`,
    async (req, reply) => {
      const token = String(req.body?.token ?? '').trim();
      const sourceVinhetaId = String(req.body?.sourceVinhetaId ?? '').trim();
      const targetVinhetaId = String(req.body?.targetVinhetaId ?? '').trim();
      if (!token || !sourceVinhetaId || !targetVinhetaId) {
        return reply.code(400).send({ ok: false, error: 'parametros_invalidos' });
      }
      const parsed = verifyVinhetaToken(token);
      if (!parsed || parsed.vinhetaId !== targetVinhetaId) {
        return reply.code(401).send({ ok: false, error: 'token_invalido' });
      }

      const srcKey = vinhetaStorageKey(sourceVinhetaId);
      const srcResolved = await resolveUsoAudio(srcKey);
      if (!srcResolved) return reply.code(404).send({ ok: false, error: 'origem_ausente' });

      ensureStorageDirs();
      const dest = vinhetaPath(targetVinhetaId);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      if (srcResolved.mp3Buffer) {
        await fsp.writeFile(dest, srcResolved.mp3Buffer);
      } else {
        await fsp.copyFile(srcResolved.filePath, dest);
      }

      const key = vinhetaStorageKey(targetVinhetaId);
      await portalQuery(
        `UPDATE vinheta SET storage_key = $2, updated_at = now() WHERE id = $1`,
        [targetVinhetaId, key],
      );
      return reply.send({ ok: true, targetVinhetaId, storageKey: key });
    },
  );
}
