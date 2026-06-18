import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { resolveTagCriativoUser } from "@/lib/criacao/criativoUserService";
import { createProgramacao, listProgramacoes } from "@/lib/criacao/programacaoService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const clienteRef = url.searchParams.get("clienteRef") ?? undefined;
    const programacoes = await listProgramacoes({ search, clienteRef });
    return NextResponse.json({ programacoes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/programacoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      clienteRef?: string;
      clienteNome?: string;
      nome?: string;
      formatoPadrao?: string;
      tagCriativoUserId?: string;
    };
    const tagCriativo = await resolveTagCriativoUser(body.tagCriativoUserId, session.email);
    const created = await createProgramacao({
      clienteRef: body.clienteRef ?? "",
      clienteNome: body.clienteNome ?? "",
      nome: body.nome ?? "",
      formatoPadrao: body.formatoPadrao,
      criativoUserId: tagCriativo.email,
      criativoNome: tagCriativo.displayName,
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio" || msg === "cliente_obrigatorio") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[criacao/programacoes POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
