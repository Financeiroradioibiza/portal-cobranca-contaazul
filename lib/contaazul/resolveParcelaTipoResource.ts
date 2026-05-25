import {
  extractBoletoAndDocUrls,
  shouldProxyContaAzulDownload,
} from "./installmentLinks";
import {
  extractBillingChargeFileUuid,
  fetchBillingChargePdfPublic,
} from "./billingChargeFilePdf";
import { tryResolveNfeDownloadUrl } from "./nfeFromVenda";
import { tryResolveNfseServicoDownload } from "./nfseServico";
import { fetchParcelaAnexoFile } from "./parcelaAnexoDownload";
import { fetchServiceInvoicePdfByVendaId } from "./serviceInvoicePdf";
import { fetchInstallmentById } from "./receivables";
import type { CaInstallmentDetail } from "./types";

const isProd = process.env.NODE_ENV === "production";

export type ResolvedParcelaTipo =
  | { kind: "external_redirect"; url: string }
  | { kind: "buffer"; mime: string; disposition: string | null; data: Buffer }
  | { kind: "not_found"; message: string }
  | { kind: "upstream_error"; status: number; messageForDev: string };

async function respToBuffer(
  upstream: Response,
): Promise<{ mime: string | null; disposition: string | null; data: Buffer }> {
  const ab = await upstream.arrayBuffer();
  return {
    mime: upstream.headers.get("content-type"),
    disposition: upstream.headers.get("content-disposition"),
    data: Buffer.from(ab),
  };
}

/** Resolve recurso único `boleto` ou `nf` para download (browser) ou e-mail em anexo. */
export async function resolveParcelaTipoResource(
  token: string,
  parcelaId: string,
  tipo: "boleto" | "nf",
  preloadDetail?: CaInstallmentDetail | null,
): Promise<ResolvedParcelaTipo> {
  let detail: CaInstallmentDetail | undefined;
  if (preloadDetail) {
    detail = preloadDetail;
  } else {
    try {
      detail = await fetchInstallmentById(token, parcelaId);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Erro ao buscar parcela na Conta Azul.";
      if (isProd) {
        console.error("[resolveParcelaTipo] fetchInstallmentById:", m);
        return { kind: "upstream_error", status: 502, messageForDev: m };
      }
      return { kind: "upstream_error", status: 502, messageForDev: m };
    }
  }

  const parcelaLinks = extractBoletoAndDocUrls(detail);
  const { boletoUrl, docUrl, boletoAnexoId, docAnexoId, boletoAnexoBaixaId, docAnexoBaixaId } =
    parcelaLinks;

  if (tipo === "boleto") {
    const billingChargeId = extractBillingChargeFileUuid(detail, parcelaLinks);
    if (billingChargeId) {
      try {
        const pdf = await fetchBillingChargePdfPublic(billingChargeId, {
          preferredReferer: parcelaLinks.boletoUrl ?? null,
        });
        if (pdf?.buffer && pdf.buffer.length >= 500) {
          return {
            kind: "buffer",
            mime: "application/pdf",
            disposition: pdf.disposition,
            data: pdf.buffer,
          };
        }
      } catch {
        /* continua pelo fluxo antigo */
      }
    }
  }

  let billingPubPdf: Response | null = null;
  let nfeFromVendaUrl: string | null = null;
  let nfseUrl: string | null = null;
  let nfsePdf: Response | null = null;
  if (tipo === "nf" && !docUrl && !docAnexoId) {
    if (detail.id_venda?.trim()) {
      billingPubPdf = await fetchServiceInvoicePdfByVendaId(detail.id_venda, token);
    }
    if (!billingPubPdf?.ok) {
      nfeFromVendaUrl = await tryResolveNfeDownloadUrl(token, {
        idVenda: detail.id_venda,
        dataRef: detail.data_referencia_nf,
        numeroNota: detail.numero_fatura,
      });
      if (!nfeFromVendaUrl) {
        const numeroNfse =
          detail.numero_nfse ??
          (detail.tipo_fatura?.toUpperCase() === "NFSE"
            ? detail.numero_fatura
            : undefined) ??
          (detail.id_venda && detail.numero_fatura ? detail.numero_fatura : undefined);
        const se = await tryResolveNfseServicoDownload(token, {
          idVenda: detail.id_venda,
          dataCompetencia: detail.data_referencia_nf,
          numeroNfse: numeroNfse ?? undefined,
          numeroRps: detail.numero_rps,
        });
        nfseUrl = se.url;
        nfsePdf = se.pdfResponse;
      }
    }
  }

  const targetUrl =
    tipo === "nf" ? (docUrl ?? nfeFromVendaUrl ?? nfseUrl) : boletoUrl;
  const targetAnexoId = tipo === "nf" ? docAnexoId : boletoAnexoId;
  const targetAnexoBaixaId = tipo === "nf" ? docAnexoBaixaId : boletoAnexoBaixaId;

  if (targetUrl) {
    let dest: URL;
    try {
      dest = new URL(targetUrl);
    } catch {
      return {
        kind: "upstream_error",
        status: 502,
        messageForDev: "URL do documento inválida.",
      };
    }

    if (dest.protocol !== "http:" && dest.protocol !== "https:") {
      return {
        kind: "upstream_error",
        status: 502,
        messageForDev: "Protocolo de URL não suportado.",
      };
    }

    if (!shouldProxyContaAzulDownload(targetUrl)) {
      return { kind: "external_redirect", url: targetUrl };
    }

    const upstream = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "*/*",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      return { kind: "upstream_error", status: upstream.status, messageForDev: body };
    }

    const { mime, disposition, data } = await respToBuffer(upstream);
    return {
      kind: "buffer",
      mime: mime ?? "application/octet-stream",
      disposition,
      data,
    };
  }

  if (tipo === "nf" && billingPubPdf?.ok) {
    const { mime, disposition, data } = await respToBuffer(billingPubPdf);
    return {
      kind: "buffer",
      mime: mime ?? "application/pdf",
      disposition,
      data,
    };
  }

  if (tipo === "nf" && nfsePdf?.ok) {
    const { mime, disposition, data } = await respToBuffer(nfsePdf);
    return {
      kind: "buffer",
      mime: mime ?? "application/pdf",
      disposition,
      data,
    };
  }

  if (targetAnexoId) {
    const fileRes = await fetchParcelaAnexoFile(
      token,
      parcelaId,
      targetAnexoId,
      targetAnexoBaixaId,
    );
    if (fileRes?.ok) {
      const { mime, disposition, data } = await respToBuffer(fileRes);
      return {
        kind: "buffer",
        mime: mime ?? "application/octet-stream",
        disposition,
        data,
      };
    }
    if (isProd) {
      console.error(
        "[resolveParcelaTipo] FILE anexo falhou:",
        fileRes?.status,
        parcelaId,
        targetAnexoId,
      );
    }
    return {
      kind: "upstream_error",
      status: 502,
      messageForDev:
        "A Conta Azul tem um arquivo nesta parcela, mas o download não foi concluído.",
    };
  }

  return {
    kind: "not_found",
    message:
      tipo === "nf"
        ? "Não há nota ou documento com link nesta parcela na Conta Azul."
        : "Não há boleto ou link de cobrança nesta parcela na Conta Azul.",
  };
}
