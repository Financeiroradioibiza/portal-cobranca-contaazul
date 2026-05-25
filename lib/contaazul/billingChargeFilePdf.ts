import type { ParcelaDocLinks } from "./installmentLinks";
import { normalizeContaAzulUrl } from "./installmentLinks";
import type { CaInstallmentDetail } from "./types";

/**
 * Ao abrir um boleto «novo» (faturas.contaazul.com), o browser chama algo como GET
 * `https://public.contaazul.com/payments/billing/charge/file/{uuid}` → PDF.
 * Esse método costuma responder sem Bearer quando o `{uuid}` da cobrança é conhecido;
 * tiramos o uuid da SPA (`#/fatura/visualizar/{uuid}`) ou de URLs já nesse formato.
 */
/** Base até `/file` (sem o uuid no fim); override só se Conta Azul mudar domínio. */
const PUBLIC_CHARGE_FILE_BASE =
  process.env.CONTA_AZUL_PUBLIC_BILLING_CHARGE_FILE_BASE?.replace(/\/$/, "") ||
  "https://public.contaazul.com/payments/billing/charge/file";

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RX_CHARGE_FILE_URL = new RegExp(
  `/payments/billing/charge/file/(${UUID})`,
  "i",
);
const RX_FATURA_HASH_VISUALIZAR = new RegExp(
  `#/+fatura/+visualizar/+(${UUID})`,
  "i",
);

/** Junta todas as URLs em que o uuid da cobrança pode aparecer. */
export function extractBillingChargeFileUuid(
  detail: CaInstallmentDetail,
  links: ParcelaDocLinks,
): string | null {
  const candidates: string[] = [];

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    const u = normalizeContaAzulUrl(sc.url);
    if (u) candidates.push(u);
  }
  if (links.boletoUrl) candidates.push(links.boletoUrl);
  for (const a of detail.anexos ?? []) {
    const u = normalizeContaAzulUrl(a.url);
    if (u) candidates.push(u);
  }

  for (const raw of candidates) {
    const mFromFile = raw.match(RX_CHARGE_FILE_URL);
    if (mFromFile?.[1]) return mFromFile[1];
  }
  for (const raw of candidates) {
    const mHash = raw.match(RX_FATURA_HASH_VISUALIZAR);
    if (mHash?.[1]) return mHash[1];
  }
  return null;
}

export type BillingChargePdfResult = { buffer: Buffer; disposition: string | null };

/** GET ao endpoint público; devolve o PDF se Content-Type/corpo parecerem válidos (>500 bytes, %PDF-). */
export async function fetchBillingChargePdfPublic(
  uuid: string,
): Promise<BillingChargePdfResult | null> {
  const id = uuid.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const url = `${PUBLIC_CHARGE_FILE_BASE}/${encodeURIComponent(id)}`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 28000);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/pdf,application/octet-stream,*/*",
        Origin: "https://faturas.contaazul.com",
        Referer: "https://faturas.contaazul.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      cache: "no-store",
      signal: ctl.signal,
    }).finally(() => clearTimeout(t));

    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("json") || ct.includes("text/html")) return null;

    const disposition = res.headers.get("content-disposition");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null;
    if (!buf.subarray(0, 5).equals(Buffer.from("%PDF-"))) return null;

    return { buffer: buf, disposition };
  } catch {
    return null;
  }
}
