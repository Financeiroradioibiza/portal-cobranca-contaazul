import { caFetch } from "./caHttp";
import { extractCaPessoasListRows } from "./personBilling";

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

/**
 * Linha válida para listagem já filtrada por `tipo_perfil=Cliente`.
 *
 * - **Não** exigimos `ativo === true`: em payloads resumidos a CA costuma enviar `false`
 *   ou omitir o campo mesmo para cadastros que na UI aparecem ativos.
 * - **`perfis` vazio:** confiamos na filtragem do servidor (ver nota anterior).
 * - **`perfis` com valores que não indicam cliente:** excluímos (sem ambiguidade).
 */
function rowPassesClienteFilteredList(row: Record<string, unknown>): boolean {
  if (!str(row.id)) return false;
  const perfs = perfisUpper(row);
  if (!isClientePerfis(perfs) && perfs.length > 0) return false;
  return true;
}

function summarizeRow(row: Record<string, unknown>): CaClienteActiveSummary | null {
  if (!rowPassesClienteFilteredList(row)) return null;
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

function totalItemsFromEnvelope(envelope: Record<string, unknown> | null): number | null {
  const candidates: unknown[] = [];
  if (envelope) {
    candidates.push(
      envelope.totalItems,
      envelope.itens_totais,
      envelope.total,
      (envelope.totais as Record<string, unknown> | undefined)?.total,
    );
    const nested = envelope.data;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const d = nested as Record<string, unknown>;
      candidates.push(d.totalItems, d.itens_totais, d.total, (d.totais as Record<string, unknown> | undefined)?.total);
    }
  }
  for (const h of candidates) {
    if (typeof h === "number" && Number.isFinite(h)) return h;
  }
  return null;
}

export function activeClientMaxPages(): number {
  const n = Number(process.env.CA_ACTIVE_CLIENT_PAGES_MAX ?? "120");
  return Math.min(300, Number.isFinite(n) && n > 0 ? n : 120);
}

/**
 * Lista pessoas com perfil **Cliente** (`tipo_perfil` na API).
 * Pagina até esgotar `totalItems`/páginas vazias. Não depende de `ativo` no JSON resumido.
 */
export async function fetchActiveClientePersonSummaries(
  accessToken: string,
): Promise<CaClienteActiveSummary[]> {
  const outMap = new Map<string, CaClienteActiveSummary>();

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
    const rows = extractCaPessoasListRows(raw);
    const itemsUnknown =
      rows ??
      (Array.isArray(envelope?.items) ? envelope!.items
      : Array.isArray(envelope?.itens) ? envelope!.itens
      : []);
    if (!Array.isArray(itemsUnknown) || itemsUnknown.length === 0) break;

    for (const rawRow of itemsUnknown) {
      const row = asRecord(rawRow);
      if (!row) continue;
      const s = summarizeRow(row);
      if (s?.id) outMap.set(s.id, s);
    }

    const totalKnown = totalItemsFromEnvelope(envelope);
    if (totalKnown != null) {
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
