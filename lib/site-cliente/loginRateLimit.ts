/**
 * Rate limit simples em memória (por IP) — login Site Clientes.
 * Sobrevive entre requests no mesmo processo Node (Netlify serverless).
 */

const HITS = new Map<string, number[]>();

const JANELA_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 20;

export function clientIpFromRequest(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xf) return xf;
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

export function loginRateLimitExceeded(ip: string): boolean {
  const agora = Date.now();
  const recentes = (HITS.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  if (recentes.length >= MAX_TENTATIVAS) {
    HITS.set(ip, recentes);
    return true;
  }
  recentes.push(agora);
  HITS.set(ip, recentes);
  if (HITS.size > 5_000) {
    for (const [k, v] of HITS) {
      if (!v.length || agora - v[v.length - 1]! > JANELA_MS) HITS.delete(k);
    }
  }
  return false;
}
