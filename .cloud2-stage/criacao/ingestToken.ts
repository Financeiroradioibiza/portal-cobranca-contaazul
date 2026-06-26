import crypto from 'node:crypto';
import { criacaoConfig } from './config.js';

/** Formato: itemId.jobId.exp.sig */
export function verifyIngestToken(token: string): { itemId: string; jobId: string } | null {
  const secret = criacaoConfig.ingestSecret;
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [itemId, jobId, expStr, sig] = parts;
  if (!itemId || !jobId || !expStr || !sig) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  const base = `${itemId}.${jobId}.${expStr}`;
  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
  if (expected.length !== sig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { itemId, jobId };
}

/** Preview upload bruto: itemId.exp → query token=sig */
export function verifyUploadStreamToken(itemId: string, exp: number, sig: string): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret || !itemId || !sig) return false;
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const base = `${itemId}.${exp}`;
  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
  if (expected.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Preview áudio: musicaId.formato.exp → query token=sig */
export function verifyStreamToken(
  musicaId: string,
  formato: string,
  exp: number,
  sig: string,
): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret || !musicaId || !formato || !sig) return false;
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const base = `${musicaId}.${formato}.${exp}`;
  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
  if (expected.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Vinheta: vinhetaId.exp.sig */
export function verifyVinhetaToken(token: string): { vinhetaId: string } | null {
  const secret = criacaoConfig.ingestSecret;
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [vinhetaId, expStr, sig] = parts;
  if (!vinhetaId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  const base = `${vinhetaId}.${expStr}`;
  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
  if (expected.length !== sig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { vinhetaId };
}

/** Preview/stream vinheta: ?exp=&token= (sig de vinhetaId.exp). */
export function verifyVinhetaStreamAccess(vinhetaId: string, exp: number, sig: string): boolean {
  const secret = criacaoConfig.ingestSecret;
  if (!secret || !vinhetaId || !sig) return false;
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const base = `${vinhetaId}.${exp}`;
  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
  if (expected.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
