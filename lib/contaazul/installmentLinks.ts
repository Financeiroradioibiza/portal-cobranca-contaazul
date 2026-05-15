import type { CaInstallmentDetail } from "./types";

/** Conta Azul às vezes devolve URL sem esquema (ex.: www…) ou path relativo à API. */
export function normalizeContaAzulUrl(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  let u = raw.trim();
  if (u.startsWith("/")) {
    return `https://api-v2.contaazul.com${u}`;
  }
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u.replace(/^\/+/, "")}`;
  }
  return u;
}

/** Baixar via nosso servidor (envia Bearer) quando a URL é da API Conta Azul. */
export function shouldProxyContaAzulDownload(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "api-v2.contaazul.com";
  } catch {
    return false;
  }
}

function tipoMatch(t: string | undefined, ...candidates: string[]): boolean {
  if (!t) return false;
  const n = t.toUpperCase().replace(/-/g, "_");
  return candidates.some((c) => c === n || n.includes(c));
}

/**
 * Extrai link de boleto/cobrança e link de documento (NF/recibo) do detalhe da parcela.
 */
export function extractBoletoAndDocUrls(detail: CaInstallmentDetail): {
  boletoUrl: string | null;
  docUrl: string | null;
} {
  let boletoUrl: string | null = null;
  let docUrl: string | null = null;

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    const tipo = sc.tipo_solicitacao_cobranca;
    const url = normalizeContaAzulUrl(sc.url);
    if (!url) continue;
    if (
      tipoMatch(tipo, "BOLETO", "BOLETO_REGISTRADO", "LINK_PAGAMENTO", "PIX_COBRANCA")
    ) {
      if (!boletoUrl) boletoUrl = url;
    }
  }

  for (const a of detail.anexos ?? []) {
    const url = normalizeContaAzulUrl(a.url);
    if (!url) continue;
    const t = a.tipo_anexo;
    if (
      tipoMatch(t, "BOLETO_BANCARIO", "BOLETO_BANCARIO_RFB", "BOLETO")
    ) {
      if (!boletoUrl) boletoUrl = url;
    }
    if (tipoMatch(t, "FATURA", "RECIBO", "RECIBO_DIGITAL", "DANFE", "NFE")) {
      if (!docUrl) docUrl = url;
    }
  }

  if (!docUrl) {
    for (const a of detail.anexos ?? []) {
      const url = normalizeContaAzulUrl(a.url);
      if (!url || !tipoMatch(a.tipo_anexo, "OUTROS")) continue;
      const name = `${a.nome ?? ""} ${a.descricao ?? ""}`.toLowerCase();
      if (/boleto/i.test(name) && !boletoUrl) {
        boletoUrl = url;
        continue;
      }
      if (/(nota|danfe|nfe|nf-?e|fiscal|dacte|pdf)/i.test(name)) {
        docUrl = url;
        break;
      }
    }
  }

  // Último recurso: qualquer cobrança com URL (às vezes o tipo vem indefinido)
  if (!boletoUrl) {
    for (const sc of detail.solicitacoes_cobrancas ?? []) {
      const url = normalizeContaAzulUrl(sc.url);
      if (url) {
        boletoUrl = url;
        break;
      }
    }
  }

  if (!docUrl) {
    for (const a of detail.anexos ?? []) {
      const url = normalizeContaAzulUrl(a.url);
      if (!url || url === boletoUrl) continue;
      if (/\.pdf(\?|$)/i.test(url)) {
        docUrl = url;
        break;
      }
    }
  }

  return { boletoUrl, docUrl };
}
