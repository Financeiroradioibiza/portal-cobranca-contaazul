import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { createAgendamento, listAgendamentos } from "@/lib/criacao/agendamentoService";
import { syncPastaFlagsProgramacao } from "@/lib/criacao/publicarService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const agendamentos = await listAgendamentos(id);
    return NextResponse.json({ agendamentos });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/programacoes/:id/agendamentos GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const created = await createAgendamento(id, body as never);
    await abrirProgramacaoAposMusica(id, session.displayName ?? session.email);
    await syncPastaFlagsProgramacao(id).catch((e) => {
      console.error("[criacao/programacoes/:id/agendamentos POST] sync gateway", e);
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "alvo_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[criacao/programacoes/:id/agendamentos POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
