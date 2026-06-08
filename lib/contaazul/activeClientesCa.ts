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

/** Pessoa ativa na CA (`ativo` no item ou filtro da API). */
function isRowAtivoCliente(row: Record<string, unknown>): boolean {
  for (const key of ["ativo", "Ativo", "active"] as const) {
    if (!(key in row)) continue;
    const v = row[key];
    if (v === false || v === 0) return false;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "false" || s === "0" || s === "inativo" || s === "inactive" || s === "n") {
        return false;
      }
      if (s === "true" || s === "1" || s === "ativo" || s === "active" || s === "s") return true;
    }
    if (v === true || v === 1) return true;
    return false;
  }
  const sit = str(row.situacao ?? row.situacao_cadastro ?? row.status).toLowerCase();
  if (sit && (sit.includes("inativ") || sit === "i")) return false;
  return true;
}

/**
 * Linha válida: perfil Cliente + **ativo** (API `ativo=true` e campo no JSON quando vier).
 */
export function caPessoaRowIsActiveCliente(row: Record<string, unknown>): boolean {
  return rowPassesClienteFilteredList(row);
}

function rowPassesClienteFilteredList(row: Record<string, unknown>): boolean {
  if (!str(row.id)) return false;
  if (!isRowAtivoCliente(row)) return false;
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

export type ActiveClientePageResult = {
  pagina: number;
  items: CaClienteActiveSummary[];
  hasMore: boolean;
};

/** Uma página da listagem CA (usado na virada em lotes). */
export async function fetchActiveClientePersonPage(
  accessToken: string,
  pagina: number,
): Promise<ActiveClientePageResult> {
  if (pagina < 1 || pagina > activeClientMaxPages()) {
    return { pagina, items: [], hasMore: false };
  }

  const qs = new URLSearchParams({
    pagina: String(pagina),
    tamanho_pagina: "200",
    tipo_perfil: "Cliente",
    ativo: "true",
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

  const items: CaClienteActiveSummary[] = [];
  if (Array.isArray(itemsUnknown)) {
    for (const rawRow of itemsUnknown) {
      const row = asRecord(rawRow);
      if (!row) continue;
      const s = summarizeRow(row);
      if (s?.id) items.push(s);
    }
  }

  if (!Array.isArray(itemsUnknown) || itemsUnknown.length === 0) {
    return { pagina, items, hasMore: false };
  }

  const totalKnown = totalItemsFromEnvelope(envelope);
  let hasMore = false;
  if (totalKnown != null) {
    const loaded = pagina * 200;
    hasMore = loaded < totalKnown && itemsUnknown.length >= 200;
  } else {
    hasMore = itemsUnknown.length >= 200 && pagina < activeClientMaxPages();
  }

  return { pagina, items, hasMore };
}

/**
 * Lista pessoas com perfil **Cliente** e **ativo=true** na API Conta Azul.
 */
export async function fetchActiveClientePersonSummaries(
  accessToken: string,
): Promise<CaClienteActiveSummary[]> {
  const outMap = new Map<string, CaClienteActiveSummary>();

  for (let pagina = 1; pagina <= activeClientMaxPages(); pagina++) {
    const page = await fetchActiveClientePersonPage(accessToken, pagina);
    for (const s of page.items) {
      if (s.id) outMap.set(s.id, s);
    }
    if (!page.hasMore) break;
  }

  return [...outMap.values()].sort((a, b) =>
    a.nomeLista.localeCompare(b.nomeLista, "pt-BR", { sensitivity: "base" }),
  );
}
