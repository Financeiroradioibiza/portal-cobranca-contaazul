import dns from "node:dns";
import https from "node:https";
import { CRIACAO_INGEST_URL } from "@/lib/criacao/ingestTicket";

/** Evita falhas intermitentes IPv6 em alguns hosts serverless. */
dns.setDefaultResultOrder("ipv4first");

/**
 * PDF da NFS-e (DANFSE) por venda — mesmo caminho do botão «Fazer download do DANFSE» no ERP.
 * URL pública (funciona no browser mesmo quando o serverless não alcança o host).
 */
const BILLING_SERVICE_INVOICE_PDF =
  "https://app.contaazul.com/pub/rest/billing-data/service-invoice";

export function serviceInvoiceDanfsePublicUrl(vendaId: string): string {
  const id = vendaId.trim();
  return `${BILLING_SERVICE_INVOICE_PDF}/${encodeURIComponent(id)}/pdf`;
}

export function isServiceInvoiceDanfseUrl(url: string): boolean {
  return /app\.contaazul\.com\/pub\/rest\/billing-data\/service-invoice\//i.test(url);
}

const RX_VENDA_ID_IN_SERVICE_INVOICE =
  /\/service-invoice\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/pdf/i;

export function parseVendaIdFromServiceInvoiceUrl(url: string): string | null {
  try {
    const u = new URL(url);
    u.search = "";
    const m = RX_VENDA_ID_IN_SERVICE_INVOICE.exec(u.pathname);
    return m?.[1]?.toLowerCase() ?? null;
  } catch {
    const m = RX_VENDA_ID_IN_SERVICE_INVOICE.exec(url);
    return m?.[1]?.toLowerCase() ?? null;
  }
}

const PDF_HEADERS = {
  Accept: "application/pdf,application/octet-stream,*/*",
  "User-Agent":
    "Mozilla/5.0 (compatible; RadioIbizaPortal/1.0; +https://portal.radioibiza.app.br)",
  Referer: "https://app.contaazul.com/",
};

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 500 && buf.subarray(0, 5).toString() === "%PDF-";
}

function fetchPdfViaNodeHttps(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: PDF_HEADERS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchPdfViaNodeHttps(res.headers.location).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(looksLikePdf(buf) ? buf : null);
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(25_000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function fetchDanfseViaCloud2Proxy(vendaId: string): Promise<Buffer | null> {
  const secret = (process.env.CRIACAO_INGEST_SECRET ?? "").trim();
  if (!secret) return null;
  const base = CRIACAO_INGEST_URL.replace(/\/ingest\/?$/, "");
  const proxyUrl = `${base}/ops/danfse-pdf?vendaId=${encodeURIComponent(vendaId)}`;
  try {
    const res = await fetch(proxyUrl, {
      headers: { "x-criacao-secret": secret, Accept: "application/pdf" },
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return looksLikePdf(buf) ? buf : null;
  } catch {
    return null;
  }
}

async function fetchPdfViaFetch(
  url: string,
  accessToken: string,
  withBearer: boolean,
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        ...PDF_HEADERS,
        ...(withBearer ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (
      ct.includes("application/json") ||
      ct.includes("text/html") ||
      (ct.includes("text/plain") && !ct.includes("pdf"))
    ) {
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return looksLikePdf(buf) ? buf : null;
  } catch {
    return null;
  }
}

export async function fetchServiceInvoicePdfBufferByVendaId(
  vendaId: string,
  accessToken: string,
): Promise<Buffer | null> {
  const id = vendaId.trim();
  if (!id) return null;

  const url = serviceInvoiceDanfsePublicUrl(id);

  /** Node https costuma funcionar em serverless quando `fetch` falha. */
  for (let attempt = 0; attempt < 3; attempt++) {
    const viaHttps = await fetchPdfViaNodeHttps(url);
    if (viaHttps) return viaHttps;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }

  /** ERP legado usa fetch sem Bearer; tentamos nessa ordem. */
  for (const withBearer of [false, true]) {
    const buf = await fetchPdfViaFetch(url, accessToken, withBearer);
    if (buf) return buf;
  }

  return fetchDanfseViaCloud2Proxy(id);
}

/** @deprecated Prefer `fetchServiceInvoicePdfBufferByVendaId`. */
export async function fetchServiceInvoicePdfByVendaId(
  vendaId: string,
  accessToken: string,
): Promise<Response | null> {
  const buf = await fetchServiceInvoicePdfBufferByVendaId(vendaId, accessToken);
  if (!buf) return null;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
}
