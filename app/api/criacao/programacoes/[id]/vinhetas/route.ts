import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { createVinheta, listVinhetas } from "@/lib/criacao/vinhetaService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const vinhetas = await listVinhetas(id);
    return NextResponse.json({ vinhetas });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/programacoes/:id/vinhetas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      tipo?: string;
      texto?: string;
      voz?: string;
    };
    const created = await createVinheta(id, {
      nome: body.nome ?? "",
      tipo: body.tipo,
      texto: body.texto,
      voz: body.voz,
    });
    await abrirProgramacaoAposMusica(id, session.displayName ?? session.email);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[criacao/programacoes/:id/vinhetas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
