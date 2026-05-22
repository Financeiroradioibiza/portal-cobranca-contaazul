import { NextResponse } from "next/server";
import {
  extractBoletoAndDocUrls,
  shouldProxyContaAzulDownload,
} from "@/lib/contaazul/installmentLinks";
import { tryResolveNfeDownloadUrl } from "@/lib/contaazul/nfeFromVenda";
import { tryResolveNfseServicoDownload } from "@/lib/contaazul/nfseServico";
import { fetchParcelaAnexoFile } from "@/lib/contaazul/parcelaAnexoDownload";
import { fetchServiceInvoicePdfByVendaId } from "@/lib/contaazul/serviceInvoicePdf";
import { fetchInstallmentById } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";

function plain(msg: string, status: number) {
  return new NextResponse(msg, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const isProd = process.env.NODE_ENV === "production";

function upstreamError(status: number, detail: string) {
  if (isProd) {
    console.error("[parcela/file] upstream error:", status, detail.slice(0, 500));
    return plain("Não foi possível obter o arquivo. Tente de novo mais tarde.", 502);
  }
  return plain(
    `Não foi possível baixar o arquivo (Conta Azul ${status}). ${detail.slice(0, 200)}`,
    502,
  );
}

/**
 * Abre ou baixa boleto / nota: redireciona para gateway externo ou faz proxy com Bearer na API v2.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const tipo = new URL(request.url).searchParams.get("tipo") ?? "boleto";

  const token = await getValidAccessToken();
  if (!token) {
    return plain("Conecte o Conta Azul novamente no portal.", 401);
  }

  let detail;
  try {
    detail = await fetchInstallmentById(token, id);
  } catch (e) {
    const m = e instanceof Error ? e.message : "Erro ao buscar parcela na Conta Azul.";
    if (isProd) {
      console.error("[parcela/file] fetchInstallmentById:", m);
      return plain("Não foi possível carregar os dados da parcela.", 502);
    }
    return plain(m, 502);
  }

  const { boletoUrl, docUrl, boletoAnexoId, docAnexoId, boletoAnexoBaixaId, docAnexoBaixaId } =
    extractBoletoAndDocUrls(detail);

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
      return plain("URL do documento inválida.", 502);
    }

    if (dest.protocol !== "http:" && dest.protocol !== "https:") {
      return plain("Protocolo de URL não suportado.", 502);
    }

    if (!shouldProxyContaAzulDownload(targetUrl)) {
      return NextResponse.redirect(targetUrl, 302);
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
      return upstreamError(upstream.status, body);
    }

    const headers = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    const cd = upstream.headers.get("content-disposition");
    if (cd) headers.set("Content-Disposition", cd);
    else headers.set("Content-Disposition", "inline");
    headers.set("Cache-Control", "no-store");

    return new NextResponse(upstream.body, { status: 200, headers });
  }

  if (tipo === "nf" && billingPubPdf?.ok) {
    const headers = new Headers();
    const ct = billingPubPdf.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    else headers.set("Content-Type", "application/pdf");
    const cd = billingPubPdf.headers.get("content-disposition");
    if (cd) headers.set("Content-Disposition", cd);
    else headers.set("Content-Disposition", "inline");
    headers.set("Cache-Control", "no-store");
    return new NextResponse(billingPubPdf.body, { status: 200, headers });
  }

  if (tipo === "nf" && nfsePdf?.ok) {
    const headers = new Headers();
    const ct = nfsePdf.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    else headers.set("Content-Type", "application/pdf");
    const cd = nfsePdf.headers.get("content-disposition");
    if (cd) headers.set("Content-Disposition", cd);
    else headers.set("Content-Disposition", "inline");
    headers.set("Cache-Control", "no-store");
    return new NextResponse(nfsePdf.body, { status: 200, headers });
  }

  if (targetAnexoId) {
    const fileRes = await fetchParcelaAnexoFile(token, id, targetAnexoId, targetAnexoBaixaId);
    if (fileRes?.ok) {
      const headers = new Headers();
      const ct = fileRes.headers.get("content-type");
      if (ct) headers.set("Content-Type", ct);
      const cd = fileRes.headers.get("content-disposition");
      if (cd) headers.set("Content-Disposition", cd);
      else headers.set("Content-Disposition", "inline");
      headers.set("Cache-Control", "no-store");
      return new NextResponse(fileRes.body, { status: 200, headers });
    }
    if (isProd) {
      console.error(
        "[parcela/file] download de anexo FILE falhou:",
        fileRes?.status,
        "parcela",
        id,
        "anexo",
        targetAnexoId,
        "baixa",
        targetAnexoBaixaId ?? "—",
      );
    }
    return plain(
      "A Conta Azul tem um arquivo nesta parcela, mas o download não foi concluído. Abra o lançamento no Conta Azul ou tente de novo.",
      502,
    );
  }

  return plain(
    tipo === "nf"
      ? "Não há nota ou documento com link nesta parcela na Conta Azul."
      : "Não há boleto ou link de cobrança nesta parcela na Conta Azul.",
    404,
  );
}
