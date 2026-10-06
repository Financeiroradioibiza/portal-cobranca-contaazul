import { caFetch } from "./caHttp";
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

/** Preenche `id_venda` quando só temos `numero_venda` (ex.: venda 119360). */
export async function enrichInstallmentVendaContext(
  accessToken: string,
  detail: CaInstallmentDetail,
): Promise<CaInstallmentDetail> {
  if (detail.id_venda?.trim()) return detail;
  const numero = detail.numero_venda;
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
    return { ...detail, id_venda: id };
  } catch {
    return detail;
  }
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
