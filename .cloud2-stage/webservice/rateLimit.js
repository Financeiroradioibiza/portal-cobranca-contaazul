/**
 * Rate limit simples por IP (memória) — reduz varredura em /login/ e /getPdvs/.
 * Para produção pesada, preferir Redis/Cloudflare WAF; isto não quebra o player.
 */

const buckets = new Map();

/** @param {string | undefined} ip */
export function clientIpFromRequest(req) {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  if (fwd) return fwd;
  return String(req.ip ?? 'unknown');
}

/**
 * @param {string} key
 * @param {{ windowMs?: number; max?: number }} opts
 * @returns {boolean} true se dentro do limite
 */
export function rateLimitCheck(key, opts = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > 20_000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }
  return b.count <= max;
}
