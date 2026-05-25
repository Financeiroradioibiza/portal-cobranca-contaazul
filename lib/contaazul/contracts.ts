import { CONTA_AZUL_API_BASE } from "./config";

type Row = {
  status?: string;
  situacao?: string | { nome?: string; descricao?: string; status?: string };
  numero?: number | string;
  /** Alguns payloads trazem o número apenas em termos */
  termos?: { numero?: number | string };
  cliente?: { id?: string };
  cliente_id?: string;
  clienteId?: string;
  id?: string;
};

function asciiUpper(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function contractStatusUpper(r: Record<string, unknown>): string {
  const s = r.status;
  if (typeof s === "string" && s.trim()) return asciiUpper(s.trim());

  const situ = r.situacao ?? r.situacao_contrato ?? r.situacaoContrato;
  if (typeof situ === "string" && situ.trim()) return asciiUpper(situ.trim());

  if (situ && typeof situ === "object" && !Array.isArray(situ)) {
    const o = situ as Record<string, unknown>;
    for (const k of ["status", "nome", "descricao", "descricao_status"] as const) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return asciiUpper(v.trim());
    }
  }
  return "";
}

/** Nº exibível do contrato (lista GET costuma usar `numero`; detalhe pode usar só `termos.numero`). */
function contractDisplayNumber(r: Record<string, unknown>): string | null {
  const top = r.numero;
  if (top != null && top !== "") return String(top);
  const termos = r.termos;
  if (termos && typeof termos === "object" && termos !== null) {
    const tn = (termos as { numero?: unknown }).numero;
    if (tn != null && tn !== "") return String(tn);
  }
  const id = r.id;
  if (typeof id === "string" && id.length) return `ref-${id.slice(0, 8)}`;
  return null;
}

function addRowsToAcc(
  items: Row[],
  want: Set<string>,
  acc: Map<string, Set<string>>,
) {
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Row;
    const status = contractStatusUpper(r as Record<string, unknown>);
    if (status !== "ATIVO") continue;

    const cid = r.cliente?.id ?? r.cliente_id ?? r.clienteId ?? "";
    if (!cid || !want.has(cid)) continue;

    const num = contractDisplayNumber(r as Record<string, unknown>);
    if (!num) continue;
    if (!acc.has(cid)) acc.set(cid, new Set());
    acc.get(cid)!.add(num);
  }
}

async function fetchContractPage(
  accessToken: string,
  qs: URLSearchParams,
): Promise<{ ok: boolean; items: Row[] }> {
  const url = `${CONTA_AZUL_API_BASE}/v1/contratos?${qs}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[contracts] GET /v1/contratos", res.status, text.slice(0, 400));
    return { ok: false, items: [] };
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    console.error("[contracts] resposta não-JSON:", trimmed.slice(0, 200));
    return { ok: true, items: [] };
  }
  try {
    const data = JSON.parse(text) as { items?: Row[]; itens?: Row[] };
    const items = data.items ?? data.itens ?? [];
    return { ok: true, items };
  } catch {
    console.error("[contracts] JSON inválido:", trimmed.slice(0, 200));
    return { ok: true, items: [] };
  }
}

/** Requisições simultâneas à Conta Azul (cada uma filtra um cliente). */
const CLIENT_FETCH_CONCURRENCY = 12;

function contractsMaxPagesAtivo(): number {
  const n = Number(process.env.CA_CONTRACTS_MAX_PAGES_ATIVO ?? "36");
  return Math.min(80, Number.isFinite(n) && n > 0 ? n : 36);
}

/** Passagem extra: o filtro `ATIVO` às vezes omite linhas que a UI marca como Ativo — varremos TODOS e filtramos no código. */
function contractsMaxPagesTodosSupplement(): number {
  const n = Number(process.env.CA_CONTRACTS_MAX_PAGES_TODOS ?? "18");
  return Math.min(60, Number.isFinite(n) && n > 0 ? n : 18);
}

async function listContractsOneClientPaged(
  accessToken: string,
  clienteId: string,
  data_inicio: string,
  data_fim: string,
  want: Set<string>,
  acc: Map<string, Set<string>>,
  statusContrato: "ATIVO" | "TODOS",
  maxPages: number,
): Promise<void> {
  let pagina = 1;
  for (;;) {
    /**
     * - `ATIVO`: páginas enxutas quando o filtro está correto na API (ex.: 6515 já não se perde atrás de INATIVOS).
     * - `TODOS`: suplemento só para apanhar inconsistências entre UI e lista filtrada; `addRowsToAcc` mantém apenas ATIVO.
     */
    const qs = new URLSearchParams({
      data_inicio,
      data_fim,
      pagina: String(pagina),
      tamanho_pagina: "50",
      cliente_id: clienteId,
      status: statusContrato,
    });

    const { ok, items } = await fetchContractPage(accessToken, qs);
    if (!ok) return;

    addRowsToAcc(items, want, acc);
    if (items.length < 50) break;
    pagina += 1;
    if (pagina > maxPages) break;
  }
}

export type FetchActiveContractsOpts = {
  /**
   * Segunda passagem `status=TODOS` cobre inconsistências da API mas dobra chamadas por cliente.
   * Desativar no sync Rio (muitos clientes) para não saturar quota/tempo da Conta Azul.
   * @default true
   */
  includeTodosSupplement?: boolean;
  /** Paralelismo por cliente; valores baixos reduzem risco de 429/throttle. @default CLIENT_FETCH_CONCURRENCY */
  clientConcurrency?: number;
};

async function listContractsOneClient(
  accessToken: string,
  clienteId: string,
  data_inicio: string,
  data_fim: string,
  want: Set<string>,
  acc: Map<string, Set<string>>,
  opts: { includeTodosSupplement: boolean },
): Promise<void> {
  await listContractsOneClientPaged(
    accessToken,
    clienteId,
    data_inicio,
    data_fim,
    want,
    acc,
    "ATIVO",
    contractsMaxPagesAtivo(),
  );
  if (!opts.includeTodosSupplement) return;
  await listContractsOneClientPaged(
    accessToken,
    clienteId,
    data_inicio,
    data_fim,
    want,
    acc,
    "TODOS",
    contractsMaxPagesTodosSupplement(),
  );
}

/**
 * Lista contratos ATIVOS por cliente (GET /v1/contratos).
 * Uma chamada filtrada por cliente, em paralelo com limite de concorrência — evita varrer centenas de páginas globais.
 */
export async function fetchActiveContractNumbersByClientIds(
  accessToken: string,
  clientIds: string[],
  opts?: FetchActiveContractsOpts,
): Promise<Map<string, string>> {
  const want = new Set(clientIds.filter(Boolean));
  if (want.size === 0) return new Map();

  const acc = new Map<string, Set<string>>();

  const end = new Date();
  const start = new Date();
  /**
   * A Conta Azul exige intervalo na listagem. Janelas curtas em `data_fim` omitiam contratos com próximos
   * vencimentos/emissões muito à frente; ~20 anos evita falsos «sem contrato ativo» na integração.
   */
  start.setFullYear(start.getFullYear() - 30);
  const data_inicio = start.toISOString().slice(0, 10);
  const data_fim = new Date(end.getTime() + 86400000 * Math.round(365.25 * 20)).toISOString().slice(0, 10);

  const idList = [...want];
  const includeTodosSupplement = opts?.includeTodosSupplement !== false;
  const concurrencyRaw = opts?.clientConcurrency ?? CLIENT_FETCH_CONCURRENCY;
  const concurrency =
    typeof concurrencyRaw === "number" &&
    Number.isFinite(concurrencyRaw) &&
    concurrencyRaw >= 1
      ? Math.min(24, concurrencyRaw | 0)
      : CLIENT_FETCH_CONCURRENCY;

  for (let i = 0; i < idList.length; i += concurrency) {
    const slice = idList.slice(i, i + concurrency);
    await Promise.all(
      slice.map((cid) =>
        listContractsOneClient(accessToken, cid, data_inicio, data_fim, want, acc, {
          includeTodosSupplement,
        }),
      ),
    );
  }

  const out = new Map<string, string>();
  for (const [cid, set] of acc) {
    out.set(
      cid,
      [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(", "),
    );
  }
  return out;
}
