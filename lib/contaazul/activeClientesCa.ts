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

/** Item de `perfis` na CA pode vir como string ou objeto `{ nome, tipo, tipo_perfil, … }`. */
function perfilItemLabel(x: unknown): string {
  if (typeof x === "string") return x.trim();
  if (typeof x === "number") return String(x);
  const o = asRecord(x);
  if (!o) return "";
  return (
    str(o.nome) ||
    str(o.name) ||
    str(o.tipo) ||
    str(o.tipoPerfil) ||
    str(o.tipo_perfil) ||
    str(o.perfil) ||
    str(o.descricao) ||
    str(o.label) ||
    ""
  );
}

function perfisUpper(row: Record<string, unknown>): string[] {
  const raw = row.perfis ?? row.Perfis;
  const fromArray =
    Array.isArray(raw) ?
      raw.map(perfilItemLabel).filter(Boolean)
    : [];
  const tipoLinha = str(row.tipo_perfil) || str(row.tipoPerfil);
  const merged = [...fromArray, ...(tipoLinha ? [tipoLinha] : [])];
  return [...new Set(merged.map((s) => s.toUpperCase()))];
}

function isClientePerfis(perfs: string[]): boolean {
  if (!perfs.length) return false;
  return perfs.some((p) => p.includes("CLIENTE"));
}

function rowHasClientePerfil(row: Record<string, unknown>): boolean {
  const perfs = perfisUpper(row);
  /** Sem `perfis` no JSON (comum no detalhe) — confia no filtro da busca / ativo. */
  if (!perfs.length) return true;
  return isClientePerfis(perfs);
}

export type CaPersonActiveCheck = {
  ok: boolean;
  reasons: string[];
  snapshot: {
    id?: string;
    ativo?: unknown;
    situacao?: string;
    perfis?: string[];
    tipo_perfil?: string;
  };
};

/** Pessoa ativa na CA (`ativo` no item ou filtro da API). */
function isRowAtivoCliente(row: Record<string, unknown>): boolean {
  for (const key of ["ativo", "Ativo", "active"] as const) {
    if (!(key in row)) continue;
    const v = row[key];
    /** Detalhe CA costuma mandar `ativo: null` — não tratar como inativo. */
    if (v === null || v === undefined || v === "") continue;
    if (v === false || v === 0) return false;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "false" || s === "0" || s === "inativo" || s === "inactive" || s === "n") {
        return false;
      }
      if (s === "true" || s === "1" || s === "ativo" || s === "active" || s === "s") return true;
      /** Valor não reconhecido — ignora e segue para situacao / default ativo. */
      continue;
    }
    if (v === true || v === 1) return true;
    continue;
  }
  const sit = str(row.situacao ?? row.situacao_cadastro ?? row.status).toLowerCase();
  if (sit && (sit.includes("inativ") || sit === "i")) return false;
  return true;
}

/** Explica por que uma linha CA passa ou não no filtro de cliente ativo (útil no modal Vincular). */
export function explainCaPersonActiveCliente(row: Record<string, unknown>): CaPersonActiveCheck {
  const reasons: string[] = [];
  const id = str(row.id);
  if (!id) reasons.push("cadastro CA sem id");

  if (!isRowAtivoCliente(row)) {
    const ativo = row.ativo ?? row.Ativo ?? row.active;
    const sit = str(row.situacao ?? row.situacao_cadastro ?? row.status);
    reasons.push(
      sit ?
        `marcado inativo (ativo=${JSON.stringify(ativo)}, situacao=${sit})`
      : `marcado inativo (ativo=${JSON.stringify(ativo)})`,
    );
  }

  const perfs = perfisUpper(row);
  if (!rowHasClientePerfil(row)) {
    reasons.push(`perfis [${perfs.join(", ")}] não incluem CLIENTE`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    snapshot: {
      id: id || undefined,
      ativo: row.ativo ?? row.Ativo ?? row.active,
      situacao: str(row.situacao ?? row.situacao_cadastro ?? row.status) || undefined,
      perfis: perfs.length ? perfs : undefined,
      tipo_perfil: str(row.tipo_perfil) || str(row.tipoPerfil) || undefined,
    },
  };
}

/**
 * Linha válida: perfil Cliente + **ativo** (API `ativo=true` e campo no JSON quando vier).
 */
export function caPessoaRowIsActiveCliente(row: Record<string, unknown>): boolean {
  return explainCaPersonActiveCliente(row).ok;
}

function rowPassesClienteFilteredList(row: Record<string, unknown>): boolean {
  if (!str(row.id)) return false;
  if (!isRowAtivoCliente(row)) return false;
  return rowHasClientePerfil(row);
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
