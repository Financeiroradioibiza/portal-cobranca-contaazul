import { caFetch } from "./caHttp";
import { mergeEmailStringsPreferFirst } from "@/lib/format";
import {
  cobrancaPlusPrincipalEmailsJoined,
  fetchPersonDetail,
} from "./personBilling";
import type {
  CaInstallmentDetail,
  CaPeopleSearchResponse,
  CaReceivableItem,
  CaReceivableSearchResponse,
} from "./types";
import { normalizeInstallmentDetail } from "./normalizeInstallment";
import { normalizeReceivableItem } from "./normalizeReceivable";

const RECEIVABLE_STATUSES_OPEN = ["ATRASADO", "EM_ABERTO", "RECEBIDO_PARCIAL"] as const;

/** Todos os status relevantes para «Total do período» no Conta Azul (inclui recebidos). */
export const RECEIVABLE_STATUSES_PERIOD_TOTAL = [
  "ATRASADO",
  "EM_ABERTO",
  "RECEBIDO_PARCIAL",
  "RECEBIDO",
] as const;

export type ReceivableStatusFilter =
  | (typeof RECEIVABLE_STATUSES_OPEN)[number]
  | (typeof RECEIVABLE_STATUSES_PERIOD_TOTAL)[number];

function receivableMaxPages(): number {
  return Math.min(
    200,
    Math.max(1, Number(process.env.CA_RECEIVABLES_MAX_PAGES ?? "45") || 45),
  );
}

function receivableParallelBatch(): number {
  return Math.min(
    6,
    Math.max(1, Number(process.env.CA_RECEIVABLES_PARALLEL ?? "4") || 4),
  );
}

/**
 * Busca parcelas a receber no intervalo de vencimento, paginando (lotes de páginas paralelas após a primeira).
 */
export async function fetchAllReceivableInstallments(
  accessToken: string,
  dataVencimentoDe: string,
  dataVencimentoAte: string,
  options?: { maxPages?: number; statuses?: readonly ReceivableStatusFilter[] },
): Promise<CaReceivableItem[]> {
  const all: CaReceivableItem[] = [];
  const tamanho_pagina = 500;
  const maxPages = options?.maxPages ?? receivableMaxPages();
  const parallel = receivableParallelBatch();
  const statuses = options?.statuses ?? RECEIVABLE_STATUSES_OPEN;

  const pushChunk = (rows: readonly unknown[] | undefined) => {
    for (const row of rows ?? []) {
      const norm = normalizeReceivableItem(row);
      if (norm) all.push(norm);
    }
  };

  const fetchPage = (pagina: number) => {
    const qs = new URLSearchParams();
    qs.set("pagina", String(pagina));
    qs.set("tamanho_pagina", String(tamanho_pagina));
    qs.set("data_vencimento_de", dataVencimentoDe);
    qs.set("data_vencimento_ate", dataVencimentoAte);
    for (const s of statuses) {
      qs.append("status", s);
    }
    const path = `/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${qs.toString()}`;
    return caFetch<CaReceivableSearchResponse>(path, accessToken);
  };

  const first = await fetchPage(1);
  const firstChunk = first.itens ?? first.items ?? [];
  pushChunk(firstChunk);
  if (firstChunk.length < tamanho_pagina) return all;

  let nextPage = 2;
  while (nextPage <= maxPages) {
    const batch: number[] = [];
    for (let k = 0; k < parallel && nextPage + k <= maxPages; k++) {
      batch.push(nextPage + k);
    }
    const results = await Promise.all(batch.map((p) => fetchPage(p)));
    let stop = false;
    for (const data of results) {
      const chunk = data.itens ?? data.items ?? [];
      pushChunk(chunk);
      if (chunk.length < tamanho_pagina) {
        stop = true;
        break;
      }
    }
    if (stop) break;
    nextPage += parallel;
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
  /** Várias requisições /v1/pessoas em paralelo. */
  const PEOPLE_PARALLEL = 3;

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    batches.push(unique.slice(i, i + batchSize));
  }

  for (let i = 0; i < batches.length; i += PEOPLE_PARALLEL) {
    const group = batches.slice(i, i + PEOPLE_PARALLEL);
    await Promise.all(
      group.map(async (batch) => {
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
            if (!p?.id) continue;
            const raw = p as unknown;
            const row = {
              id: p.id,
              nome: p.nome,
              documento: p.documento ?? null,
              /** Cobrança/faturamento + principal/outros (`outros_contatos`), sem repetir destinatários. */
              email: cobrancaPlusPrincipalEmailsJoined(raw),
            };
            map.set(p.id, row);
          }
        } catch {
          // Filtro pode variar na API; segue com nome da parcela.
        }
      }),
    );
  }

  const detailParallel = Math.min(
    16,
    Math.max(1, Number(process.env.CA_PERSON_DETAIL_CONCURRENCY ?? "10") || 10),
  );
  /** GET `/v1/pessoas/:id` traz `contato_cobranca_faturamento` de forma estável — a lista por ids costuma omitir/reduzir. */
  const detailIds = [...map.keys()];
  for (let i = 0; i < detailIds.length; i += detailParallel) {
    const slice = detailIds.slice(i, i + detailParallel);
    await Promise.all(
      slice.map(async (id) => {
        try {
          const detail = await fetchPersonDetail(accessToken, id);
          const cur = map.get(id);
          if (!cur) return;
          /** Preferimos o detalhe; depois o que já tínhamos da listagem; dedupe preservando ordem. */
          const merged = mergeEmailStringsPreferFirst(
            cobrancaPlusPrincipalEmailsJoined(detail),
            cur.email ?? "",
          );
          map.set(id, { ...cur, email: merged });
        } catch {
          /* Mantém apenas o já extraído da listagem. */
        }
      }),
    );
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
