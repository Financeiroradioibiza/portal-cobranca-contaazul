import fsp from 'node:fs/promises';

/** MP3 real de faixa musical — ab abixo disso é HTML/JSON de erro ou arquivo truncado. */
export const MIN_MP3_BYTES = 12_288;

export function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  return false;
}

export function mp3InvalidReason(buf: Buffer, sizeBytes: number): string | null {
  if (sizeBytes < MIN_MP3_BYTES) {
    return `arquivo muito pequeno (${sizeBytes} bytes)`;
  }
  const head = buf.subarray(0, Math.min(buf.length, 32));
  const asText = head.toString('utf8', 0, Math.min(head.length, 16)).trimStart();
  if (asText.startsWith('<!') || asText.startsWith('<html') || asText.startsWith('{')) {
    return 'conteúdo parece HTML/JSON (não áudio)';
  }
  if (!looksLikeMp3(head)) {
    return 'cabeçalho não é MP3 (ID3 ou frame MPEG)';
  }
  return null;
}

export async function assertValidMp3File(filePath: string): Promise<{ size: number }> {
  const stat = await fsp.stat(filePath);
  const headLen = Math.min(stat.size, 512);
  const head = Buffer.alloc(headLen);
  const fh = await fsp.open(filePath, 'r');
  try {
    await fh.read(head, 0, headLen, 0);
  } finally {
    await fh.close();
  }
  const reason = mp3InvalidReason(head, stat.size);
  if (reason) {
    throw new Error(`MP3 inválido do Deemix (${reason})`);
  }
  return { size: stat.size };
}

export async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch {
    /* ignore */
  }
}
