import { NextResponse } from "next/server";
import { resolveSiteClienteCobrancaDocumento } from "@/lib/site-cliente/siteClienteCobrancaDocumento";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";

export const runtime = "nodejs";
export const maxDuration = 45;

const isProd = process.env.NODE_ENV === "production";

function plain(msg: string, status: number) {
  return new NextResponse(msg, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function upstreamPlain(status: number, detail: string) {
  if (isProd) {
    console.error("[site-cliente/cobranca/documento] upstream:", status, detail.slice(0, 500));
    return plain("Não foi possível obter o arquivo. Tente de novo mais tarde.", 502);
  }
  return plain(`Não foi possível baixar o arquivo (upstream ${status}). ${detail.slice(0, 200)}`, 502);
}

export async function GET(request: Request) {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    const { searchParams } = new URL(request.url);
    const parcelaId = searchParams.get("parcelaId") ?? "";
    const caPersonId = searchParams.get("caPersonId");
    const tipoRaw = searchParams.get("tipo") ?? "boleto";
    const tipo = tipoRaw === "nf" ? "nf" : "boleto";

    const resolved = await resolveSiteClienteCobrancaDocumento(
      session,
      parcelaId,
      tipo,
      caPersonId,
    );

    if (resolved.kind === "external_redirect") {
      // Site cliente usa fetch (CSP connect-src 'self') — não HTTP 302 para URL externa.
      return NextResponse.json(
        { ok: true, mode: "external", url: resolved.url },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (resolved.kind === "buffer") {
      const headers = new Headers();
      headers.set("Content-Type", resolved.mime || "application/octet-stream");
      if (resolved.disposition) headers.set("Content-Disposition", resolved.disposition);
      else headers.set("Content-Disposition", "inline");
      headers.set("Cache-Control", "no-store");
      return new NextResponse(new Uint8Array(resolved.data), { status: 200, headers });
    }

    if (resolved.kind === "not_found") {
      return plain(resolved.message, 404);
    }

    return upstreamPlain(resolved.status, resolved.messageForDev);
  } catch (e) {
    if (e instanceof Response) {
      if (e.status === 403 || e.status === 400 || e.status === 503) {
        try {
          const body = await e.clone().json();
          return NextResponse.json(body, { status: e.status });
        } catch {
          return e;
        }
      }
      return e;
    }
    console.error("[site-cliente/cobranca/documento GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
