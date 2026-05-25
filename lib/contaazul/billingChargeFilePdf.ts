import type { ParcelaDocLinks } from "./installmentLinks";
import { normalizeContaAzulUrl } from "./installmentLinks";
import type { CaInstallmentDetail } from "./types";

/**
 * Ao abrir um boleto «novo» (faturas.contaazul.com), o browser chama algo como GET
 * `https://public.contaazul.com/payments/billing/charge/file/{uuid}` → PDF.
 */
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
const RX_VISUALIZAR_FLEX = new RegExp(
  `visualizar(?:/|%2[Ff])(${UUID})`,
  "i",
);

function tryDecodeUrl(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function walkStrings(v: unknown, out: string[]): void {
  if (typeof v === "string") {
    out.push(v);
    return;
  }
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    for (const x of v) walkStrings(x, out);
    return;
  }
  if (typeof v === "object") {
    for (const x of Object.values(v)) walkStrings(x, out);
  }
}

/** Strings que devem estar ligadas ao link da cobrança (evita apanhar outros UUID na parcela). */
function billingHint(s: string): boolean {
  return /\bfaturas\.contaazul\.com\b|\bpublic\.contaazul\.com\b\/payments\/billing|#\/?fatura\/visualizar|charge\/file|iugu|cobran(?:ça|ca)\b/i.test(
    s,
  );
}

/**
 * Fallback: qualquer texto aninhado no JSON da parcela que contenha URL/hint de cobrança + UUID válido.
 */
export function extractBillingChargeUuidFromDetailBillingStrings(
  detail: CaInstallmentDetail,
): string | null {
  const strings: string[] = [];
  walkStrings(detail, strings);
  for (const s of strings) {
    if (!billingHint(s)) continue;
    const id = extractBillingChargeUuidFromUrlString(s);
    if (id) return id;
  }
  return null;
}

/** Tenta tirar um UUID da cobrança até de URLs só com fragment ou percent-encoded. */
export function extractBillingChargeUuidFromUrlString(raw: string): string | null {
  const variants = [...new Set([raw, tryDecodeUrl(raw)])];
  for (const v of variants) {
    let m = v.match(RX_CHARGE_FILE_URL);
    if (m?.[1]) return m[1];
    m = v.match(RX_FATURA_HASH_VISUALIZAR);
    if (m?.[1]) return m[1];
    m = v.match(RX_VISUALIZAR_FLEX);
    if (m?.[1]) return m[1];
  }

  const base = variants[0] ?? raw;
  if (/faturas\.contaazul\.com/i.test(base)) {
    const fragment = base.includes("#") ? base.slice(base.indexOf("#")) : base;
    const reGlob = new RegExp(`(${UUID})`, "gi");
    let last: string | null = null;
    let mm: RegExpExecArray | null;
    while ((mm = reGlob.exec(fragment)) !== null) last = mm[1];
    if (last) return last;
  }
  return null;
}

/** `chargeRequests[].id` ≠ UUID em `#/fatura/visualizar/` — prioriza links dessa página. */
function preferUrlsWithFaturaVisualizarCandidates(urls: string[]): string[] {
  const prio: string[] = [];
  const rest: string[] = [];
  for (const u of urls) {
    if (/faturas\.contaazul\.com/i.test(u) && /fatura\/visualizar/i.test(u))
      prio.push(u);
    else rest.push(u);
  }
  return [...prio, ...rest];
}

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

  const ranked = preferUrlsWithFaturaVisualizarCandidates(candidates);

  for (const raw of ranked) {
    let m = raw.match(RX_FATURA_HASH_VISUALIZAR);
    if (m?.[1]) return m[1];
    m = raw.match(RX_VISUALIZAR_FLEX);
    if (m?.[1]) return m[1];
  }
  for (const raw of ranked) {
    const mFromFile = raw.match(RX_CHARGE_FILE_URL);
    if (mFromFile?.[1]) return mFromFile[1];
  }
  for (const raw of ranked) {
    const loose = extractBillingChargeUuidFromUrlString(raw);
    if (loose) return loose;
  }

  return extractBillingChargeUuidFromDetailBillingStrings(detail);
}

export type BillingChargePdfResult = { buffer: Buffer; disposition: string | null };

const UA_MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** GET público ao PDF da cobrança; tenta vários Referer — o Akamai/CDN por vezes exige o mesmo contexto da página da fatura. */
export async function fetchBillingChargePdfPublic(
  uuid: string,
  opts?: { preferredReferer?: string | null },
): Promise<BillingChargePdfResult | null> {
  const id = uuid.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const url = `${PUBLIC_CHARGE_FILE_BASE}/${encodeURIComponent(id)}`;

  type TryOpt = { referer: string; secFetch: boolean };
  const trials: TryOpt[] = [];
  const seen = new Set<string>();
  function pushTrial(r: string, secFetch: boolean) {
    const ref = r.trim();
    if (!ref) return;
    const k = `${ref}__${secFetch ? "1" : "0"}`;
    if (seen.has(k)) return;
    seen.add(k);
    trials.push({ referer: ref, secFetch });
  }

  pushTrial(opts?.preferredReferer ?? "", true);
  pushTrial("https://faturas.contaazul.com/?tipo=boleto", true);
  pushTrial("https://faturas.contaazul.com/", true);
  pushTrial("https://faturas.contaazul.com/", false);
  pushTrial(opts?.preferredReferer ?? "", false);

  async function attempt(t: TryOpt): Promise<BillingChargePdfResult | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 26000);

    try {
      const hdrs: Record<string, string> = {
        Accept: "application/pdf,application/octet-stream,*/*",
        Origin: "https://faturas.contaazul.com",
        Referer: t.referer,
        "User-Agent": UA_MAC_CHROME,
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      };
      if (t.secFetch) hdrs["sec-fetch-site"] = "same-site";

      const res = await fetch(url, {
        method: "GET",
        headers: hdrs,
        redirect: "follow",
        cache: "no-store",
        signal: ctl.signal,
      });

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
    } finally {
      clearTimeout(timer);
    }
  }

  for (const trial of trials) {
    const out = await attempt(trial);
    if (out) return out;
  }
  return null;
}
