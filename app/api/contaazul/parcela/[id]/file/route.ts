import { NextResponse } from "next/server";
import {
  extractBoletoAndDocUrls,
  shouldProxyContaAzulDownload,
} from "@/lib/contaazul/installmentLinks";
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

  const { boletoUrl, docUrl } = extractBoletoAndDocUrls(detail);
  const target = tipo === "nf" ? docUrl : boletoUrl;

  if (!target) {
    return plain(
      tipo === "nf"
        ? "Não há nota ou documento com link nesta parcela na Conta Azul."
        : "Não há boleto ou link de cobrança nesta parcela na Conta Azul.",
      404,
    );
  }

  let dest: URL;
  try {
    dest = new URL(target);
  } catch {
    return plain("URL do documento inválida.", 502);
  }

  if (dest.protocol !== "http:" && dest.protocol !== "https:") {
    return plain("Protocolo de URL não suportado.", 502);
  }

  if (!shouldProxyContaAzulDownload(target)) {
    return NextResponse.redirect(target, 302);
  }

  const upstream = await fetch(target, {
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
