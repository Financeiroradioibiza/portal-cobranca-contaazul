import fsp from 'node:fs/promises';
import path from 'node:path';
import { usoB2Enabled, usoDiskMirrorEnabled } from './config.js';
import { uploadUsoObjectToB2 } from './b2.js';
import { packUsoAudio } from './rib.js';
import {
  b2VersaoStorageKey,
  usoB2ObjectKey,
  usoPath,
  usoRelFromStorageKey,
  usoStorageKey,
} from './storage.js';

const FORMATO_USO = 'mp3_128_mono';

export type Uso128WriteResult = {
  neonStorageKey: string;
  bytes: number;
  b2Verified: boolean;
  b2ObjectKey: string | null;
  diskMirrored: boolean;
  encrypted: boolean;
  ext: '.mp3' | '.rib';
};

/**
 * Grava 128 mono: B2 opcional (CRIACAO_USO_B2=1) + espelho NVMe (CRIACAO_USO_DISK_MIRROR=1).
 * Baseline prod (B2 off): Neon `uso:` + disco — Player 5 e preview portal inalterados.
 */
export async function writeUso128Delivery(musicaId: string, mp3Buf: Buffer): Promise<Uso128WriteResult> {
  const packed = packUsoAudio(mp3Buf);
  const bytes = packed.data.length;
  const localKey = usoStorageKey(musicaId, FORMATO_USO, packed.ext);

  let neonStorageKey = localKey;
  let b2Verified = false;
  let b2ObjectKey: string | null = null;
  let diskMirrored = false;

  if (usoDiskMirrorEnabled()) {
    const rel = usoRelFromStorageKey(localKey);
    const usoDest = usoPath(rel);
    await fsp.mkdir(path.dirname(usoDest), { recursive: true });
    await fsp.writeFile(usoDest, packed.data);
    diskMirrored = true;
  }

  if (usoB2Enabled()) {
    b2ObjectKey = usoB2ObjectKey(musicaId, FORMATO_USO, packed.ext);
    await uploadUsoObjectToB2(b2ObjectKey, packed.data, packed.ext);
    neonStorageKey = b2VersaoStorageKey(b2ObjectKey);
    b2Verified = true;
  } else if (!diskMirrored) {
    const rel = usoRelFromStorageKey(localKey);
    const usoDest = usoPath(rel);
    await fsp.mkdir(path.dirname(usoDest), { recursive: true });
    await fsp.writeFile(usoDest, packed.data);
    diskMirrored = true;
  }

  return {
    neonStorageKey,
    bytes,
    b2Verified,
    b2ObjectKey,
    diskMirrored,
    encrypted: packed.encrypted,
    ext: packed.ext,
  };
}

export function usoFilenameForCleanup(ext: '.mp3' | '.rib'): string {
  return `${FORMATO_USO}${ext}`;
}
