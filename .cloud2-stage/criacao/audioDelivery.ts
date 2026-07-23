import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { FastifyReply } from 'fastify';
import { getB2ObjectBuffer } from './b2.js';
import { decryptRib, isRibFile, ribEnabled } from './rib.js';
import {
  s3KeyFromVersaoStorageKey,
  usoPath,
  usoRelFromStorageKey,
  usoStorageKey,
  vinhetaIdFromStorageKey,
  vinhetaPath,
  vinhetaTrilhaIdFromStorageKey,
  vinhetaTrilhaPath,
} from './storage.js';

type ResolvedAudio = {
  /** Arquivo legível no disco (mp3 ou .rib). */
  filePath: string;
  /** MP3 descriptografado em memória (quando .rib). */
  mp3Buffer: Buffer | null;
  contentLength: number;
};

const FORMATO_USO_FALLBACK = 'mp3_128_mono';

/** Resolve áudio de uso pelo id da faixa — sem consulta ao Neon (evita 500 por timeout do pool). */
export async function resolveMusicaUsoAudioById(
  musicaId: string,
  formato: string,
): Promise<ResolvedAudio | null> {
  const id = musicaId.trim();
  if (!id) return null;

  const formatos = formato === FORMATO_USO_FALLBACK ? [formato] : [formato, FORMATO_USO_FALLBACK];
  const exts: Array<'.rib' | '.mp3'> = ribEnabled() ? ['.rib', '.mp3'] : ['.mp3', '.rib'];

  for (const fmt of formatos) {
    for (const ext of exts) {
      const resolved = await resolveUsoAudio(usoStorageKey(id, fmt, ext));
      if (resolved) return resolved;
    }
  }
  return null;
}

export async function resolveUsoAudio(storageKey: string): Promise<ResolvedAudio | null> {
  try {
    const b2Key = s3KeyFromVersaoStorageKey(storageKey);
    if (b2Key) {
      const buf = await getB2ObjectBuffer(b2Key);
      if (!buf) return null;
      if (isRibFile(b2Key)) {
        const mp3Buffer = decryptRib(buf);
        return { filePath: '', mp3Buffer, contentLength: mp3Buffer.length };
      }
      return { filePath: '', mp3Buffer: buf, contentLength: buf.length };
    }

    const vinhetaId = vinhetaIdFromStorageKey(storageKey);
    if (vinhetaId) {
      const filePath = vinhetaPath(vinhetaId);
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat) return null;
      return { filePath, mp3Buffer: null, contentLength: stat.size };
    }

    const trilhaId = vinhetaTrilhaIdFromStorageKey(storageKey);
    if (trilhaId) {
      const filePath = vinhetaTrilhaPath(trilhaId);
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
  } catch {
    return null;
  }
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
