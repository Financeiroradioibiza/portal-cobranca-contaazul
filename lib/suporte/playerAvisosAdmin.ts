const DEFAULT_ADMIN_URL =
  "https://player4.radioibiza.com.br/.netlify/functions/player-avisos-admin";

export type PlayerAvisosAction = "listar" | "ativar" | "apagar";

export type PlayerAvisosRequest = {
  email: string;
  password: string;
  action: PlayerAvisosAction;
  cliente_id?: number;
  pdv_id?: number;
  mensagem?: string;
};

export type PlayerAvisosRow = {
  cliente_id: number;
  pdv_id: number;
  mensagem: string;
  atualizado_em: string;
};

export function playerAvisosAdminUrl(): string {
  return process.env.PLAYER_AVISOS_ADMIN_URL?.trim() || DEFAULT_ADMIN_URL;
}

export function parsePainelNumericId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function parsePlayerAvisosError(data: unknown): string {
  if (!data || typeof data !== "object") return "Resposta inválida.";
  const err = (data as { error?: unknown }).error;
  if (err === "credenciais") return "E-mail ou senha incorretos.";
  if (err === "admin_not_configured") {
    return "Servidor do player sem credenciais configuradas (IBIZA_AVISOS_* no Netlify).";
  }
  if (err === "storage_falhou") {
    return "Armazenamento indisponível. Verifique Blobs no site do player.";
  }
  if (typeof err === "string" && err.trim()) return err;
  return "Operação falhou.";
}

export function parsePlayerAvisosRows(data: unknown): PlayerAvisosRow[] {
  if (!data || typeof data !== "object" || !("rows" in data)) return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];

  const out: PlayerAvisosRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const cliente_id = parsePainelNumericId(r.cliente_id);
    const pdv_id = parsePainelNumericId(r.pdv_id);
    const mensagem = typeof r.mensagem === "string" ? r.mensagem.trim() : "";
    const atualizado_em =
      typeof r.atualizado_em === "string" ? r.atualizado_em.trim() : "";
    if (cliente_id == null || pdv_id == null || !mensagem) continue;
    out.push({ cliente_id, pdv_id, mensagem, atualizado_em });
  }
  return out;
}

export async function callPlayerAvisosAdmin(
  body: PlayerAvisosRequest,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(playerAvisosAdminUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}
