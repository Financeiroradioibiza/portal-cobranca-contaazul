import { caFetch } from "./caHttp";

/** Listagem `/v1/pessoas`: filtramos cliente ativo conforme payloads usuais da Conta Azul. */
export type CaClienteActiveSummary = {
  id: string;
  nomeLista: string;
  documento: string | null;
  perfisLista: string[];
};

function asRecord(o: unknown): Record<string, unknown> | null {
  return typeof o === "object" && o !== null && !Array.isArray(o)
    ? (o as Record<string, unknown>)
    : null;
}

function str(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  return t;
}

function perfisUpper(row: Record<string, unknown>): string[] {
  const raw = row.perfis ?? row.Perfis;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim().toUpperCase())
    .filter(Boolean);
}

function isClientePerfis(perfs: string[]): boolean {
  if (!perfs.length) return false;
  return perfs.some((p) => p.includes("CLIENTE"));
}

/** Perfil cliente + marcação ativa (quando a API enviar `ativo`, exigimos `true`). */
function rowIsClienteAtivo(row: Record<string, unknown>): boolean {
  if (!str(row.id)) return false;
  const ativoKnown = typeof row.ativo === "boolean";
  if (ativoKnown && row.ativo !== true) return false;
  if (!isClientePerfis(perfisUpper(row))) return false;
  return true;
}

function summarizeRow(row: Record<string, unknown>): CaClienteActiveSummary | null {
  if (!rowIsClienteAtivo(row)) return null;
  return {
    id: str(row.id),
    nomeLista: str(row.nome) || str(row.nomeFantasia) || str(row.name) || "(sem nome)",
    documento:
      typeof row.documento === "string" && row.documento.trim()
        ? row.documento.trim()
        : null,
    perfisLista: perfisUpper(row),
  };
}

export function activeClientMaxPages(): number {
  const n = Number(process.env.CA_ACTIVE_CLIENT_PAGES_MAX ?? "120");
  return Math.min(300, Number.isFinite(n) && n > 0 ? n : 120);
}

/**
 * Lista pessoas com perfil **Cliente** marcadas como ativas quando o campo existe.
 * Pagina até esgotar `totalItems`/páginas vazias.
 */
export async function fetchActiveClientePersonSummaries(
  accessToken: string,
): Promise<CaClienteActiveSummary[]> {
  const outMap = new Map<string, CaClienteActiveSummary>();
  const seenTotal = new Set<number>();

  for (let pagina = 1; pagina <= activeClientMaxPages(); pagina++) {
    const qs = new URLSearchParams({
      pagina: String(pagina),
      tamanho_pagina: "200",
      tipo_perfil: "Cliente",
      tipo_ordenacao: "NOME",
      ordem_ordenacao: "ASC",
    });
    const raw = await caFetch<unknown>(`/v1/pessoas?${qs}`, accessToken);
    const envelope = asRecord(raw);
    const itemsUnknown = envelope?.items ?? envelope?.itens ?? [];
    if (!Array.isArray(itemsUnknown) || itemsUnknown.length === 0) break;

    for (const rawRow of itemsUnknown) {
      const row = asRecord(rawRow);
      if (!row) continue;
      const s = summarizeRow(row);
      if (s?.id) outMap.set(s.id, s);
    }

    const totalHints = [
      envelope?.totalItems,
      envelope?.itens_totais,
      (envelope?.total as unknown) ?? (envelope?.totais as Record<string, unknown>)?.total,
    ];
    let totalKnown: number | null = null;
    for (const h of totalHints) {
      if (typeof h === "number" && Number.isFinite(h)) {
        totalKnown = h;
        break;
      }
    }
    if (totalKnown != null) {
      seenTotal.add(totalKnown);
      const loaded = pagina * 200;
      if (loaded >= totalKnown || itemsUnknown.length < 200) break;
      continue;
    }

    if (itemsUnknown.length < 200) break;
  }

  return [...outMap.values()].sort((a, b) =>
    a.nomeLista.localeCompare(b.nomeLista, "pt-BR", { sensitivity: "base" }),
  );
}
