import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { deleteVinheta, updateVinheta } from "@/lib/criacao/vinhetaService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const row = await prisma.vinheta.findUnique({
      where: { id },
      select: { programacaoId: true },
    });
    const body = (await request.json().catch(() => ({}))) as { nome?: string; texto?: string; voz?: string };
    const ok = await updateVinheta(id, body);
    if (ok) {
      await abrirProgramacaoAposMusica(row?.programacaoId, session.displayName ?? session.email);
    }
    return NextResponse.json({ ok });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/vinhetas/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const row = await prisma.vinheta.findUnique({
      where: { id },
      select: { programacaoId: true },
    });
    await deleteVinheta(id);
    await abrirProgramacaoAposMusica(row?.programacaoId, session.displayName ?? session.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/vinhetas/:id DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
