import fs from 'node:fs';
import path from 'node:path';
import { criacaoConfig } from './config.js';

function root(): string {
  return criacaoConfig.storageRoot;
}

/** Impede path traversal em chaves relativas (`../`). */
function pathDentroDe(baseDir: string, rel: string): string | null {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, rel);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

export function ensureStorageDirs(): void {
  for (const sub of ['upload', 'work', 'uso', 'master-local', 'vinheta', 'vinheta-trilha', 'download-staging']) {
    fs.mkdirSync(path.join(root(), sub), { recursive: true });
  }
}

/** Scratch do upload bruto (antes do pipeline). */
export function uploadPath(itemId: string): string {
  return path.join(root(), 'upload', `${itemId}.mp3`);
}

export function uploadKey(itemId: string): string {
  return `upload:${itemId}.mp3`;
}

/** MP3 baixado por Spotizerr/Deemix/YouTube antes do upload manual. */
export function downloadStagingPath(itemId: string): string {
  return path.join(root(), 'download-staging', `${itemId}.mp3`);
}

export function downloadStagingKey(itemId: string): string {
  return `download-staging:${itemId}.mp3`;
}

export function downloadStagingRelFromKey(key: string): string | null {
  if (!key.startsWith('download-staging:')) return null;
  return key.slice('download-staging:'.length);
}

/** Diretório temporário por item (wav/mp3 intermediários). */
export function workDir(itemId: string): string {
  return path.join(root(), 'work', itemId);
}

/** Caminho absoluto de uma versão de uso a partir da chave relativa. */
export function usoPath(rel: string): string {
  const safe = pathDentroDe(path.join(root(), 'uso'), rel);
  if (!safe) throw new Error('storage_key_invalida');
  return safe;
}

/** Chave relativa + prefixo `uso:` gravado no Neon/gateway. */
export function usoStorageKey(musicaId: string, formato: string, ext: '.mp3' | '.rib' = '.mp3'): string {
  const rel = `musicas/${musicaId}/${formato}${ext}`;
  return `uso:${rel}`;
}

export function usoRelFromStorageKey(key: string): string {
  return key.startsWith('uso:') ? key.slice(4) : key;
}

/** Fallback local quando B2 não está configurado. */
export function masterLocalPath(musicaId: string): string {
  return path.join(root(), 'master-local', `${musicaId}.mp3`);
}

export function masterStorageKey(musicaId: string): string {
  return `${criacaoConfig.b2.prefix.replace(/\/?$/, '/')}${musicaId}.mp3`;
}

/** Áudio de vinheta (spot) — MP3 plano no disco local. */
export function vinhetaPath(vinhetaId: string): string {
  const id = String(vinhetaId ?? '').trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error('vinheta_id_invalido');
  }
  const safe = pathDentroDe(path.join(root(), 'vinheta'), `${id}.mp3`);
  if (!safe) throw new Error('vinheta_id_invalido');
  return safe;
}

export function vinhetaStorageKey(vinhetaId: string): string {
  return `vinheta:${vinhetaId}.mp3`;
}

export function vinhetaIdFromStorageKey(key: string): string | null {
  if (!key.startsWith('vinheta:')) return null;
  const name = key.slice('vinheta:'.length);
  if (!name.endsWith('.mp3')) return null;
  const id = name.slice(0, -4);
  return id || null;
}

export function vinhetaTrilhaPath(trilhaId: string): string {
  const id = String(trilhaId ?? '').trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error('trilha_id_invalido');
  }
  const safe = pathDentroDe(path.join(root(), 'vinheta-trilha'), `${id}.mp3`);
  if (!safe) throw new Error('trilha_id_invalido');
  return safe;
}

export function vinhetaTrilhaStorageKey(trilhaId: string): string {
  return `vinheta-trilha:${trilhaId}.mp3`;
}

export function vinhetaTrilhaIdFromStorageKey(key: string): string | null {
  if (!key.startsWith('vinheta-trilha:')) return null;
  const name = key.slice('vinheta-trilha:'.length);
  if (!name.endsWith('.mp3')) return null;
  const id = name.slice(0, -4);
  return id || null;
}
