import { CONTA_AZUL_API_BASE } from "./config";
import type { CaInstallmentDetail } from "./types";

const RX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET …/contas-a-receber/cobranca/{id}/pdf — API Cobranças (2026-10). */
export async function fetchCobrancaBoletoPdfApi(
  accessToken: string,
  idCobranca: string,
): Promise<Buffer | null> {
  const id = idCobranca.trim();
  if (!RX_UUID.test(id)) return null;

  const url = `${CONTA_AZUL_API_BASE}/v1/financeiro/eventos-financeiros/contas-a-receber/cobranca/${encodeURIComponent(id)}/pdf`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/pdf,application/octet-stream,*/*",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("json") || ct.includes("html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null;
    if (buf.subarray(0, 5).toString() !== "%PDF-") return null;
    return buf;
  } catch {
    return null;
  }
}

/** IDs de cobrança na parcela (solicitações / chargeRequests). */
export function listCobrancaIdsFromInstallment(detail: CaInstallmentDetail): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  function push(id: string | undefined) {
    const v = id?.trim();
    if (!v || !RX_UUID.test(v) || seen.has(v.toLowerCase())) return;
    seen.add(v.toLowerCase());
    out.push(v);
  }

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    push(sc.id);
  }

  return out;
}

export async function tryFetchBoletoPdfViaCobrancaApi(
  accessToken: string,
  detail: CaInstallmentDetail,
): Promise<Buffer | null> {
  for (const cobId of listCobrancaIdsFromInstallment(detail)) {
    const buf = await fetchCobrancaBoletoPdfApi(accessToken, cobId);
    if (buf) return buf;
  }
  return null;
}
