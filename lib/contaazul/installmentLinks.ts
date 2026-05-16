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

export type ParcelaDocLinks = {
  boletoUrl: string | null;
  docUrl: string | null;
  /** Quando o anexo é FILE na API e não há URL pública */
  boletoAnexoId: string | null;
  docAnexoId: string | null;
};

type Anexo = NonNullable<CaInstallmentDetail["anexos"]>[number];

/**
 * Extrai link de boleto/cobrança e link de documento (NF/recibo) do detalhe da parcela.
 */
export function extractBoletoAndDocUrls(detail: CaInstallmentDetail): ParcelaDocLinks {
  let boletoUrl: string | null = null;
  let docUrl: string | null = null;
  let boletoAnexoId: string | null = null;
  let docAnexoId: string | null = null;

  function considerBoletoAnexo(a: Anexo, urlNorm: string | null) {
    if (urlNorm) {
      if (!boletoUrl) boletoUrl = urlNorm;
      return;
    }
    if (a.id && !boletoAnexoId) {
      boletoAnexoId = a.id;
    }
  }

  function considerDocAnexo(a: Anexo, urlNorm: string | null) {
    if (urlNorm) {
      if (!docUrl) docUrl = urlNorm;
      return;
    }
    if (a.id && !docAnexoId) {
      docAnexoId = a.id;
    }
  }

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    const tipo = sc.tipo_solicitacao_cobranca;
    const url = normalizeContaAzulUrl(sc.url);
    if (!url) continue;
    if (
      tipoMatch(
        tipo,
        "BOLETO",
        "BOLETO_REGISTRADO",
        "LINK_PAGAMENTO",
        "PIX_COBRANCA",
        "PIX",
        "COBRANCA",
        "BOLEPIX",
      )
    ) {
      if (!boletoUrl) boletoUrl = url;
    }
  }

  for (const a of detail.anexos ?? []) {
    const url = normalizeContaAzulUrl(a.url);
    const t = a.tipo_anexo;
    if (
      tipoMatch(t, "BOLETO_BANCARIO", "BOLETO_BANCARIO_RFB", "BOLETO")
    ) {
      considerBoletoAnexo(a, url);
      continue;
    }
    if (
      tipoMatch(
        t,
        "FATURA",
        "RECIBO",
        "RECIBO_DIGITAL",
        "DANFE",
        "NFE",
        "NFSE",
        "NF_E",
        "NOTA_FISCAL",
        "DOCUMENTO_FISCAL",
        "CTE",
        "XML",
        "ESPELHO",
      )
    ) {
      considerDocAnexo(a, url);
    }
  }

  if (!docUrl) {
    for (const a of detail.anexos ?? []) {
      const url = normalizeContaAzulUrl(a.url);
      if (!url || !tipoMatch(a.tipo_anexo, "OUTROS")) continue;
      const name = `${a.nome ?? ""} ${a.descricao ?? ""}`.toLowerCase();
      if (/boleto/i.test(name) && !boletoUrl) {
        considerBoletoAnexo(a, url);
        continue;
      }
      if (/(nota|danfe|nfe|nf-?e|nfse|fiscal|dacte|nfs-e|pdf)/i.test(name)) {
        considerDocAnexo(a, url);
        break;
      }
    }
  }

  if (!docUrl || !boletoUrl) {
    for (const a of detail.anexos ?? []) {
      const url = normalizeContaAzulUrl(a.url);
      const blob = `${a.tipo_anexo ?? ""} ${a.nome ?? ""} ${a.descricao ?? ""}`.toLowerCase();
      if (!boletoUrl && !boletoAnexoId && /boleto|ficha.?compensa|linha.?digit/i.test(blob)) {
        considerBoletoAnexo(a, url);
        continue;
      }
      if (
        !docUrl &&
        !docAnexoId &&
        /(nota|danfe|nfe|nf-?e|nfse|fiscal|dacte|recibo|xml|espelho)/i.test(blob)
      ) {
        considerDocAnexo(a, url);
      }
    }
  }

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

  return { boletoUrl, docUrl, boletoAnexoId, docAnexoId };
}
