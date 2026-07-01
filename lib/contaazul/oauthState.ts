import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const MAX_AGE_MS = 600_000;

function oauthStateSecret(): string {
  const s = process.env.PORTAL_SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("PORTAL_SESSION_SECRET ausente ou curta (mín. 32 caracteres).");
  }
  return s;
}

/** State assinado — funciona mesmo quando o callback cai em outro host (Netlify vs domínio custom). */
export function createCaOAuthState(): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = String(Date.now() + MAX_AGE_MS);
  const payload = `${nonce}.${exp}`;
  const sig = createHmac("sha256", oauthStateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyCaOAuthState(state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, exp, sig] = parts;
  if (!nonce || !exp || !sig) return false;
  const payload = `${nonce}.${exp}`;
  const expected = createHmac("sha256", oauthStateSecret()).update(payload).digest("hex");
  try {
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  const expMs = Number(exp);
  return Number.isFinite(expMs) && Date.now() <= expMs;
}
