import crypto from 'node:crypto';
import { criacaoConfig } from './config.js';

const MAGIC = Buffer.from('RIB1');

export function ribEnabled(): boolean {
  return criacaoConfig.ribSecret.length >= 16;
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(`radio-ibiza-rib:${secret}`).digest();
}

/** Criptografa MP3 → .rib (AES-256-GCM). Se secret ausente, devolve MP3 sem alterar. */
export function packUsoAudio(mp3: Buffer): { data: Buffer; encrypted: boolean; ext: '.rib' | '.mp3' } {
  if (!ribEnabled()) {
    return { data: mp3, encrypted: false, ext: '.mp3' };
  }
  const iv = crypto.randomBytes(12);
  const key = deriveKey(criacaoConfig.ribSecret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(mp3), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { data: Buffer.concat([MAGIC, iv, tag, enc]), encrypted: true, ext: '.rib' };
}

export function isRibFile(relPath: string): boolean {
  return relPath.endsWith('.rib') || relPath.includes('.rib');
}

export function decryptRib(rib: Buffer): Buffer {
  if (rib.length < MAGIC.length + 12 + 16 + 1) {
    throw new Error('rib_invalido');
  }
  if (!rib.subarray(0, 4).equals(MAGIC)) {
    throw new Error('rib_magic');
  }
  if (!ribEnabled()) throw new Error('rib_secret_ausente');
  const iv = rib.subarray(4, 16);
  const tag = rib.subarray(16, 32);
  const enc = rib.subarray(32);
  const key = deriveKey(criacaoConfig.ribSecret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
