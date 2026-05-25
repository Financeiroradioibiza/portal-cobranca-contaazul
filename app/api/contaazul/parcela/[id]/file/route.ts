import { NextResponse } from "next/server";
import { resolveParcelaTipoResource } from "@/lib/contaazul/resolveParcelaTipoResource";
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

function upstreamPlain(status: number, detail: string) {
  if (isProd) {
    console.error("[parcela/file] upstream error:", status, detail.slice(0, 500));
    return plain("Não foi possível obter o arquivo. Tente de novo mais tarde.", 502);
  }
  return plain(`Não foi possível baixar o arquivo (upstream ${status}). ${detail.slice(0, 200)}`, 502);
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

  const resolved = await resolveParcelaTipoResource(
    token,
    id,
    tipo === "nf" ? "nf" : "boleto",
  );

  if (resolved.kind === "external_redirect") {
    return NextResponse.redirect(resolved.url, 302);
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
}
