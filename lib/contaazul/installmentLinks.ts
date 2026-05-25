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

/** Cobrança iugu — HTML em `faturas.contaazul.com` com UUID do PDF público no fragmento. */
function isFaturaPortalVisualizarUrl(url: string): boolean {
  return /faturas\.contaazul\.com/i.test(url) && /fatura\/visualizar/i.test(url);
}

export type ParcelaDocLinks = {
  boletoUrl: string | null;
  docUrl: string | null;
  /** Quando o anexo é FILE na API e não há URL pública */
  boletoAnexoId: string | null;
  /** Se o anexo do boleto veio de `baixas`, informar para montar a URL correta. */
  boletoAnexoBaixaId: string | null;
  docAnexoId: string | null;
  docAnexoBaixaId: string | null;
};

type Anexo = NonNullable<CaInstallmentDetail["anexos"]>[number];

/**
 * Extrai link de boleto/cobrança e link de documento (NF/recibo) do detalhe da parcela.
 */
export function extractBoletoAndDocUrls(detail: CaInstallmentDetail): ParcelaDocLinks {
  let boletoUrl: string | null = null;
  let docUrl: string | null = null;
  let boletoAnexoId: string | null = null;
  let boletoAnexoBaixaId: string | null = null;
  let docAnexoId: string | null = null;
  let docAnexoBaixaId: string | null = null;

  function baixaIdFrom(a: Anexo): string | null {
    const raw = a.id_baixa?.trim();
    return raw || null;
  }

  function considerBoletoAnexo(a: Anexo, urlNorm: string | null) {
    if (urlNorm) {
      if (!boletoUrl) {
        boletoUrl = urlNorm;
        boletoAnexoBaixaId = null;
      }
      return;
    }
    if (a.id && !boletoAnexoId) {
      boletoAnexoId = a.id;
      boletoAnexoBaixaId = baixaIdFrom(a);
    }
  }

  function considerDocAnexo(a: Anexo, urlNorm: string | null) {
    if (urlNorm) {
      if (!docUrl) {
        docUrl = urlNorm;
        docAnexoBaixaId = null;
      }
      return;
    }
    if (a.id && !docAnexoId) {
      docAnexoId = a.id;
      docAnexoBaixaId = baixaIdFrom(a);
    }
  }

  for (const sc of detail.solicitacoes_cobrancas ?? []) {
    const tipo = sc.tipo_solicitacao_cobranca;
    const url = normalizeContaAzulUrl(sc.url);
    if (!url) continue;
    if (isFaturaPortalVisualizarUrl(url)) {
      /** Prioridade: link oficial da fatura (UUID do PDF público pode divergir de `chargeRequests.id`). */
      if (!boletoUrl || !isFaturaPortalVisualizarUrl(boletoUrl)) {
        boletoUrl = url;
        boletoAnexoBaixaId = null;
      }
      continue;
    }
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
        "CHARGE_REQUEST",
        "CHARGE_REQUEST_ID_FALLBACK",
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
        "NFCE",
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
      if (/\.pdf([\?#]|$)/i.test(url) || /danfe|nfe|nota|fiscal|nf-?e/i.test(url)) {
        docUrl = url;
        break;
      }
    }
  }

  /* FILE sem tipo claro: prioriza nome/descrição que lembra fiscal (evita pegar comprovante genérico). */
  if (!docUrl && !docAnexoId) {
    for (const a of detail.anexos ?? []) {
      const tcont = (a.tipo_conteudo ?? "").toUpperCase();
      if (tcont !== "FILE" || !a.id) continue;
      if (boletoAnexoId === a.id) continue;
      const blob = `${a.tipo_anexo ?? ""} ${a.nome ?? ""} ${a.descricao ?? ""}`.toLowerCase();
      if (/boleto|ficha|linha.?digit|pix|remessa|cobranca.?registrada/i.test(blob)) continue;
      if (
        /(nota|danfe|nfe|nf-?e|nfse|fiscal|dacte|nfs|xml|espelho|fatura|rps|invoice)/i.test(
          blob,
        )
      ) {
        considerDocAnexo(a, normalizeContaAzulUrl(a.url ?? undefined));
        break;
      }
    }
  }

  return {
    boletoUrl,
    docUrl,
    boletoAnexoId,
    boletoAnexoBaixaId,
    docAnexoId,
    docAnexoBaixaId,
  };
}
