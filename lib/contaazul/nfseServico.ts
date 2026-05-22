import { CONTA_AZUL_API_BASE } from "./config";
import { caFetch } from "./caHttp";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
  return null;
}

/** API exige janela de competência de no máximo 15 dias. */
function windowCompetencia15(refYmd: string): { de: string; ate: string } {
  const ate = new Date(`${refYmd}T12:00:00`);
  const dEnd = Number.isNaN(ate.getTime()) ? new Date() : ate;
  const de = new Date(dEnd);
  de.setDate(de.getDate() - 14);
  return { de: de.toISOString().slice(0, 10), ate: dEnd.toISOString().slice(0, 10) };
}

function itemIdVenda(row: Record<string, unknown>): string | undefined {
  return str(row.id_venda) ?? str(row.idVenda);
}

/** Campos observados / plausíveis em listagem de NFS-e e respostas JSON de “download”. */
function pickNfseHttpUrl(row: Record<string, unknown>): string | null {
  const direct = [
    row.url,
    row.link,
    row.pdf,
    row.url_danfse,
    row.urlDanfse,
    row.link_danfse,
    row.linkDanfse,
    row.link_pdf_danfse,
    row.url_pdf_danfse,
    row.url_pdf,
    row.urlPdf,
    row.link_prefeitura,
    row.url_prefeitura,
    row.linkPrefeitura,
    row.urlPrefeitura,
    row.link_visualizacao_nfse,
    row.url_visualizacao,
    row.link_visualizacao,
    row.linkDps,
    row.url_dps,
  ];
  for (const c of direct) {
    const s = str(c);
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  if (isRecord(row.arquivo)) {
    const s =
      str(row.arquivo.url) ?? str(row.arquivo.link) ?? str(row.arquivo.href);
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  return null;
}

function rowMatches(
  row: Record<string, unknown>,
  opts: {
    idVenda?: string;
    numeroNfse?: number;
    numeroRps?: number;
  },
): boolean {
  if (opts.idVenda?.trim()) {
    if (itemIdVenda(row) !== opts.idVenda.trim()) return false;
  }
  if (opts.numeroNfse != null && opts.numeroNfse > 0) {
    const n = num(row.numero_nfse ?? row.numeroNfse);
    if (n !== opts.numeroNfse) return false;
  }
  if (opts.numeroRps != null && opts.numeroRps > 0) {
    const n = num(row.numero_rps ?? row.numeroRps);
    if (n !== opts.numeroRps) return false;
  }
  return true;
}

type NfseList = {
  itens?: unknown[];
  items?: unknown[];
  paginacao?: {
    pagina_atual?: number;
    total_paginas?: number;
    paginaAtual?: number;
    totalPaginas?: number;
  };
};

async function tryNfsePdfEndpoints(
  accessToken: string,
  nfseId: string,
): Promise<Response | null> {
  const enc = encodeURIComponent(nfseId);
  const paths = [
    `/v1/notas-fiscais-servico/${enc}/danfse`,
    `/v1/notas-fiscais-servico/${enc}/danfse/pdf`,
    `/v1/notas-fiscais-servico/${enc}/pdf`,
    `/v1/notas-fiscais-servico/${enc}/arquivo`,
    `/v1/notas-fiscais-servico/${enc}/download`,
  ];

  for (const p of paths) {
    const res = await fetch(`${CONTA_AZUL_API_BASE}${p}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/pdf,application/octet-stream,application/json;q=0.1,*/*",
      },
      cache: "no-store",
    });

    if (!res.ok) continue;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("application/json")) {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as Record<string, unknown>;
        const u = pickNfseHttpUrl(j);
        if (u) {
          const r2 = await fetch(u, { redirect: "follow", cache: "no-store" });
          if (r2.ok) return r2;
        }
      } catch {
        /* ignora */
      }
      continue;
    }

    if (
      ct.includes("pdf") ||
      ct.includes("octet-stream") ||
      ct.startsWith("application/") ||
      ct === ""
    ) {
      return res;
    }
  }
  return null;
}

/**
 * NFS-e de serviço (DANFSE no ERP): lista em GET /v1/notas-fiscais-servico e tenta
 * URL na resposta ou download por ID (rotas não documentadas publicamente — tentativa).
 */
export async function tryResolveNfseServicoDownload(
  accessToken: string,
  opts: {
    idVenda?: string;
    dataCompetencia?: string;
    numeroNfse?: number;
    numeroRps?: number;
  },
): Promise<{ url: string | null; pdfResponse: Response | null }> {
  const ref =
    (opts.dataCompetencia ?? new Date().toISOString().slice(0, 10)).slice(
      0,
      10,
    );
  const { de, ate } = windowCompetencia15(ref);

  const hasFilter =
    Boolean(opts.idVenda?.trim()) ||
    (opts.numeroNfse != null && opts.numeroNfse > 0) ||
    (opts.numeroRps != null && opts.numeroRps > 0);

  if (!hasFilter) {
    return { url: null, pdfResponse: null };
  }

  const tryPage = async (pagina: number) => {
    const qs = new URLSearchParams();
    qs.set("data_competencia_de", de);
    qs.set("data_competencia_ate", ate);
    qs.set("pagina", String(pagina));
    qs.set("tamanho_pagina", "50");
    for (const st of ["EMITIDA", "CORRIGIDA_SUCESSO"]) {
      qs.append("status", st);
    }
    if (opts.numeroNfse != null && opts.numeroNfse > 0) {
      qs.set("numero_nfse_inicial", String(opts.numeroNfse));
      qs.set("numero_nfse_final", String(opts.numeroNfse));
    }
    if (opts.numeroRps != null && opts.numeroRps > 0) {
      qs.set("numero_rps_inicial", String(opts.numeroRps));
      qs.set("numero_rps_final", String(opts.numeroRps));
    }
    return caFetch<NfseList>(
      `/v1/notas-fiscais-servico?${qs.toString()}`,
      accessToken,
    );
  };

  let list: NfseList;
  try {
    list = await tryPage(1);
  } catch {
    return { url: null, pdfResponse: null };
  }

  const totalPaginas =
    list.paginacao?.total_paginas ??
    list.paginacao?.totalPaginas ??
    1;

  const maxPages = Math.min(15, Math.max(1, totalPaginas || 1));

  for (let page = 1; page <= maxPages; page++) {
    const batch = page === 1 ? list : await tryPage(page).catch(() => null);
    if (!batch) break;

    const rows = batch.itens ?? batch.items ?? [];
    for (const raw of rows) {
      if (!isRecord(raw)) continue;
      if (!rowMatches(raw, opts)) continue;

      const url = pickNfseHttpUrl(raw);
      if (url) return { url, pdfResponse: null };

      const nfseId = str(raw.id) ?? str(raw.id_nfse) ?? str(raw.idNfse);
      if (nfseId) {
        const pdfResponse = await tryNfsePdfEndpoints(accessToken, nfseId);
        if (pdfResponse?.ok) return { url: null, pdfResponse };
      }
    }
  }

  return { url: null, pdfResponse: null };
}
