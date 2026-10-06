import { caFetch } from "./caHttp";
import { lookupIdVendaFromNfseServicoList } from "./nfseServico";
import { fetchServiceInvoicePdfBufferByVendaId } from "./serviceInvoicePdf";
import type { CaInstallmentDetail } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v, 10);
  return undefined;
}

function numeroVendaFromDetail(detail: CaInstallmentDetail): number | undefined {
  if (detail.numero_venda != null && detail.numero_venda > 0) {
    return detail.numero_venda;
  }
  const fromDesc = detail.descricao
    ? parseNumeroVendaFromText(detail.descricao)
    : undefined;
  return fromDesc;
}

function numeroNfseFromDetail(detail: CaInstallmentDetail): number | undefined {
  if (detail.numero_nfse != null && detail.numero_nfse > 0) {
    return detail.numero_nfse;
  }
  if (detail.tipo_fatura?.toUpperCase() === "NFSE" && detail.numero_fatura) {
    return detail.numero_fatura;
  }
  if (detail.descricao) {
    return parseNfseNumeroFromText(detail.descricao);
  }
  return undefined;
}

/** Preenche `id_venda` quando só temos `numero_venda` (ex.: venda 119360). */
export async function enrichInstallmentVendaContext(
  accessToken: string,
  detail: CaInstallmentDetail,
): Promise<CaInstallmentDetail> {
  if (detail.id_venda?.trim()) return detail;
  const numero = numeroVendaFromDetail(detail);
  if (numero == null || numero <= 0) return detail;

  const clienteId = detail.cliente?.id?.trim();
  const qs = new URLSearchParams();
  qs.set("pagina", "1");
  qs.set("tamanho_pagina", "10");
  qs.append("numeros", String(numero));
  if (clienteId) qs.append("ids_clientes", clienteId);

  try {
    const res = await caFetch<{ itens?: unknown[] }>(
      `/v1/venda/busca?${qs.toString()}`,
      accessToken,
    );
    const row = res.itens?.[0];
    if (!isRecord(row)) return detail;
    const id = str(row.id);
    if (!id) return detail;
    return { ...detail, id_venda: id, numero_venda: numero };
  } catch {
    return detail;
  }
}

/**
 * Garante `id_venda` para DANFSE (PDF público por venda), inclusive via listagem NFS-e.
 */
export async function ensureVendaIdForNfPdf(
  accessToken: string,
  detail: CaInstallmentDetail,
): Promise<CaInstallmentDetail> {
  if (detail.id_venda?.trim()) return detail;

  const numero = numeroVendaFromDetail(detail);
  let next =
    numero != null ? { ...detail, numero_venda: numero } : { ...detail };
  next = await enrichInstallmentVendaContext(accessToken, next);
  if (next.id_venda?.trim()) return next;

  const numeroNfse = numeroNfseFromDetail(next);
  const idFromNfse = await lookupIdVendaFromNfseServicoList(accessToken, {
    idCliente: next.cliente?.id,
    dataCompetencia: next.data_referencia_nf,
    dataVencimento: next.data_vencimento,
    numeroVenda: next.numero_venda,
    numeroNfse,
    numeroRps: next.numero_rps,
  });
  if (idFromNfse) {
    return { ...next, id_venda: idFromNfse };
  }
  return next;
}

function pushVendaIdCandidate(out: string[], id?: string) {
  const v = id?.trim();
  if (!v || out.includes(v)) return;
  out.push(v);
}

/**
 * Baixa DANFSE (service-invoice) tentando vários candidatos a UUID de venda —
 * corrige `id_venda` errado na parcela e falhas pontuais de fetch.
 */
export async function tryFetchNfPdfBufferForInstallment(
  accessToken: string,
  detail: CaInstallmentDetail,
): Promise<Buffer | null> {
  const candidates: string[] = [];
  let work: CaInstallmentDetail = {
    ...detail,
    numero_venda: numeroVendaFromDetail(detail) ?? detail.numero_venda,
  };

  pushVendaIdCandidate(candidates, work.id_venda);

  if (work.numero_venda != null && work.numero_venda > 0) {
    const fromBusca = await enrichInstallmentVendaContext(accessToken, {
      ...work,
      id_venda: undefined,
    });
    pushVendaIdCandidate(candidates, fromBusca.id_venda);
    work = { ...work, ...fromBusca };
  }

  work = await ensureVendaIdForNfPdf(accessToken, work);
  pushVendaIdCandidate(candidates, work.id_venda);

  for (const vendaId of candidates) {
    const pdf = await fetchServiceInvoicePdfBufferByVendaId(vendaId, accessToken);
    if (pdf) return pdf;
  }

  return null;
}

/** Extrai número da venda de textos como «Venda 119360 / NFS-e:7162». */
export function parseNumeroVendaFromText(text: string): number | undefined {
  const m = /\bvenda\s*[#:]?\s*(\d{4,})\b/i.exec(text);
  if (!m?.[1]) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseNfseNumeroFromText(text: string): number | undefined {
  const m = /nfs-?e\s*[#:]?\s*(\d+)/i.exec(text);
  if (!m?.[1]) return undefined;
  return num(m[1]) ?? undefined;
}

export function parseRpsNumeroFromText(text: string): number | undefined {
  const m = /\brps\s*[#:]?\s*(\d+)/i.exec(text);
  if (!m?.[1]) return undefined;
  return num(m[1]) ?? undefined;
}
