import { NextResponse } from "next/server";
import { isDanfsePdfBuffer } from "@/lib/contaazul/danfsePdf";
import { resolveParcelaDanfseMeta } from "@/lib/contaazul/resolveParcelaDanfseMeta";
import { resolveParcelaTipoResource } from "@/lib/contaazul/resolveParcelaTipoResource";
import {
  fetchServiceInvoicePdfBufferByVendaId,
  isServiceInvoiceDanfseUrl,
  parseVendaIdFromServiceInvoiceUrl,
  serviceInvoiceDanfsePublicUrl,
} from "@/lib/contaazul/serviceInvoicePdf";
import { getValidAccessToken } from "@/lib/contaazul/session";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function upstreamPlain(status: number, detail: string) {
  if (isProd) {
    console.error("[parcela/file] upstream error:", status, detail.slice(0, 500));
    return plain("Não foi possível obter o arquivo. Tente de novo mais tarde.", 502);
  }
  return plain(`Não foi possível baixar o arquivo (upstream ${status}). ${detail.slice(0, 200)}`, 502);
}

function pdfBufferResponse(
  data: Buffer,
  disposition: string,
): NextResponse {
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "no-store");
  return new NextResponse(new Uint8Array(data), { status: 200, headers });
}

/**
 * Abre ou baixa boleto / nota: proxy com Bearer na API v2 ou DANFSE (service-invoice).
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

  if (tipo === "nf") {
    const meta = await resolveParcelaDanfseMeta(token, id);
    if (!meta) {
      return plain(
        "Não há nota ou documento com link nesta parcela na Conta Azul.",
        404,
      );
    }
    const buf = await fetchServiceInvoicePdfBufferByVendaId(meta.idVenda, token);
    if (buf && (isDanfsePdfBuffer(buf) || buf.length >= 50_000)) {
      return pdfBufferResponse(buf, `attachment; filename="${meta.filename}"`);
    }
    return NextResponse.json(
      {
        kind: "danfse_public",
        openUrl: meta.openUrl,
        filename: meta.filename,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const resolved = await resolveParcelaTipoResource(token, id, "boleto");

  if (resolved.kind === "buffer") {
    const headers = new Headers();
    headers.set("Content-Type", resolved.mime || "application/octet-stream");
    if (resolved.disposition) {
      headers.set("Content-Disposition", resolved.disposition);
    } else {
      const fallback = tipo === "nf" ? "nota.pdf" : "boleto.pdf";
      headers.set("Content-Disposition", `attachment; filename="${fallback}"`);
    }
    headers.set("Cache-Control", "no-store");
    return new NextResponse(new Uint8Array(resolved.data), { status: 200, headers });
  }

  if (resolved.kind === "external_redirect") {
    const dest = new URL(resolved.url);
    if (isServiceInvoiceDanfseUrl(dest.href)) dest.search = "";
    return new Response(null, {
      status: 302,
      headers: { Location: dest.href, "Cache-Control": "no-store" },
    });
  }

  if (resolved.kind === "not_found") {
    return plain(resolved.message, 404);
  }

  return upstreamPlain(resolved.status, resolved.messageForDev);
}
