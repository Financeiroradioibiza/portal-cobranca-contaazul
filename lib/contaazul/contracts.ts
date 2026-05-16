import { CONTA_AZUL_API_BASE } from "./config";

type Row = {
  status?: string;
  numero?: number | string;
  cliente?: { id?: string };
  cliente_id?: string;
  clienteId?: string;
  id?: string;
};

function addRowsToAcc(
  items: Row[],
  want: Set<string>,
  acc: Map<string, Set<string>>,
) {
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Row;
    const status = String(r.status ?? "").toUpperCase();
    if (status !== "ATIVO") continue;

    const cid = r.cliente?.id ?? r.cliente_id ?? r.clienteId ?? "";
    if (!cid || !want.has(cid)) continue;

    const num =
      r.numero != null && r.numero !== ""
        ? String(r.numero)
        : r.id
          ? `ref-${String(r.id).slice(0, 8)}`
          : null;

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
const MAX_PAGES_PER_CLIENT = 10;

async function listContractsOneClient(
  accessToken: string,
  clienteId: string,
  data_inicio: string,
  data_fim: string,
  want: Set<string>,
  acc: Map<string, Set<string>>,
): Promise<void> {
  let pagina = 1;
  for (;;) {
    const qs = new URLSearchParams({
      data_inicio,
      data_fim,
      pagina: String(pagina),
      tamanho_pagina: "50",
      cliente_id: clienteId,
    });

    const { ok, items } = await fetchContractPage(accessToken, qs);
    if (!ok) return;

    addRowsToAcc(items, want, acc);
    if (items.length < 50) break;
    pagina += 1;
    if (pagina > MAX_PAGES_PER_CLIENT) break;
  }
}

/**
 * Lista contratos ATIVOS por cliente (GET /v1/contratos).
 * Uma chamada filtrada por cliente, em paralelo com limite de concorrência — evita varrer centenas de páginas globais.
 */
export async function fetchActiveContractNumbersByClientIds(
  accessToken: string,
  clientIds: string[],
): Promise<Map<string, string>> {
  const want = new Set(clientIds.filter(Boolean));
  if (want.size === 0) return new Map();

  const acc = new Map<string, Set<string>>();

  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 12);
  const data_inicio = start.toISOString().slice(0, 10);
  const data_fim = new Date(end.getTime() + 86400000 * 800).toISOString().slice(0, 10);

  const idList = [...want];

  for (let i = 0; i < idList.length; i += CLIENT_FETCH_CONCURRENCY) {
    const slice = idList.slice(i, i + CLIENT_FETCH_CONCURRENCY);
    await Promise.all(
      slice.map((cid) =>
        listContractsOneClient(accessToken, cid, data_inicio, data_fim, want, acc),
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
