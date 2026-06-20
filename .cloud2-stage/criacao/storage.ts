import fs from 'node:fs';
import path from 'node:path';
import { criacaoConfig } from './config.js';

function root(): string {
  return criacaoConfig.storageRoot;
}

export function ensureStorageDirs(): void {
  for (const sub of ['upload', 'work', 'uso', 'master-local']) {
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

/** Diretório temporário por item (wav/mp3 intermediários). */
export function workDir(itemId: string): string {
  return path.join(root(), 'work', itemId);
}

/** Caminho absoluto de uma versão de uso a partir da chave relativa. */
export function usoPath(rel: string): string {
  return path.join(root(), 'uso', rel);
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
