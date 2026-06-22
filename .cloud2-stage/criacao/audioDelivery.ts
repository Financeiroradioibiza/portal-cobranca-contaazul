import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { FastifyReply } from 'fastify';
import { decryptRib, isRibFile } from './rib.js';
import { usoPath, usoRelFromStorageKey, vinhetaIdFromStorageKey, vinhetaPath } from './storage.js';

type ResolvedAudio = {
  /** Arquivo legível no disco (mp3 ou .rib). */
  filePath: string;
  /** MP3 descriptografado em memória (quando .rib). */
  mp3Buffer: Buffer | null;
  contentLength: number;
};

export async function resolveUsoAudio(storageKey: string): Promise<ResolvedAudio | null> {
  const vinhetaId = vinhetaIdFromStorageKey(storageKey);
  if (vinhetaId) {
    const filePath = vinhetaPath(vinhetaId);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) return null;
    return { filePath, mp3Buffer: null, contentLength: stat.size };
  }

  const rel = usoRelFromStorageKey(storageKey);
  const filePath = usoPath(rel);
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat) return null;

  if (isRibFile(rel)) {
    const rib = await fsp.readFile(filePath);
    const mp3Buffer = decryptRib(rib);
    return { filePath, mp3Buffer, contentLength: mp3Buffer.length };
  }

  return { filePath, mp3Buffer: null, contentLength: stat.size };
}

/** Stream MP3 para preview (biblioteca) ou player — suporta .rib e range parcial. */
export async function sendAudioReply(
  reply: FastifyReply,
  resolved: ResolvedAudio,
  rangeHeader: string | undefined,
  cacheControl: string,
): Promise<FastifyReply> {
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', 'audio/mpeg');
  reply.header('Cache-Control', cacheControl);

  const total = resolved.contentLength;

  if (resolved.mp3Buffer) {
    if (rangeHeader) {
      const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end) return reply.code(416).header('Content-Range', `bytes */${total}`).send();
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
      reply.header('Content-Length', String(end - start + 1));
      return reply.send(resolved.mp3Buffer.subarray(start, end + 1));
    }
    reply.header('Content-Length', String(total));
    return reply.send(resolved.mp3Buffer);
  }

  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end) return reply.code(416).header('Content-Range', `bytes */${total}`).send();
    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
    reply.header('Content-Length', String(end - start + 1));
    return reply.send(fs.createReadStream(resolved.filePath, { start, end }));
  }

  reply.header('Content-Length', String(total));
  return reply.send(fs.createReadStream(resolved.filePath));
}
