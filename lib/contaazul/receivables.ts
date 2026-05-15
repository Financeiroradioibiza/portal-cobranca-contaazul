import { CONTA_AZUL_API_BASE } from "./config";
import type {
  CaInstallmentDetail,
  CaPeopleSearchResponse,
  CaReceivableItem,
  CaReceivableSearchResponse,
} from "./types";
import { normalizeInstallmentDetail } from "./normalizeInstallment";

async function caFetch<T>(
  pathWithQuery: string,
  accessToken: string,
): Promise<T> {
  const url = `${CONTA_AZUL_API_BASE}${pathWithQuery}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const short = pathWithQuery.split("?")[0];
    throw new Error(`Conta Azul ${short}: ${res.status} ${text}`);
  }
  return JSON.parse(text) as T;
}

const RECEIVABLE_STATUSES = ["ATRASADO", "EM_ABERTO", "RECEBIDO_PARCIAL"] as const;

/**
 * Busca parcelas a receber no intervalo de vencimento, paginando.
 */
export async function fetchAllReceivableInstallments(
  accessToken: string,
  dataVencimentoDe: string,
  dataVencimentoAte: string,
): Promise<CaReceivableItem[]> {
  const all: CaReceivableItem[] = [];
  let pagina = 1;
  const tamanho_pagina = 500;

  for (;;) {
    const qs = new URLSearchParams();
    qs.set("pagina", String(pagina));
    qs.set("tamanho_pagina", String(tamanho_pagina));
    qs.set("data_vencimento_de", dataVencimentoDe);
    qs.set("data_vencimento_ate", dataVencimentoAte);
    for (const s of RECEIVABLE_STATUSES) {
      qs.append("status", s);
    }

    const path = `/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${qs.toString()}`;
    const data = await caFetch<CaReceivableSearchResponse>(path, accessToken);
    const chunk = data.itens ?? [];
    all.push(...chunk);
    if (chunk.length < tamanho_pagina) break;
    pagina += 1;
    if (pagina > 200) break;
  }

  return all;
}

/**
 * Busca cadastro de pessoas por IDs (lotes).
 */
export async function fetchPeopleByIds(
  accessToken: string,
  ids: string[],
): Promise<Map<string, { id: string; nome: string; documento?: string | null; email?: string | null }>> {
  const map = new Map<
    string,
    { id: string; nome: string; documento?: string | null; email?: string | null }
  >();
  const unique = [...new Set(ids)].filter(Boolean);
  const batchSize = 40;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const qs = new URLSearchParams();
    qs.set("pagina", "1");
    qs.set("tamanho_pagina", "1000");
    for (const id of batch) {
      qs.append("ids", id);
    }
    const path = `/v1/pessoas?${qs.toString()}`;
    try {
      const data = await caFetch<CaPeopleSearchResponse>(path, accessToken);
      const items = data.itens ?? data.items ?? [];
      for (const p of items) {
        if (p?.id) map.set(p.id, p);
      }
    } catch {
      // Filtro pode variar na API; segue com nome da parcela.
    }
  }

  return map;
}

/** Detalhes de uma parcela (boleto, anexos, cobrança registrada, etc.). */
export async function fetchInstallmentById(
  accessToken: string,
  id: string,
): Promise<CaInstallmentDetail> {
  const raw = await caFetch<unknown>(
    `/v1/financeiro/eventos-financeiros/parcelas/${encodeURIComponent(id)}`,
    accessToken,
  );
  return normalizeInstallmentDetail(raw);
}
