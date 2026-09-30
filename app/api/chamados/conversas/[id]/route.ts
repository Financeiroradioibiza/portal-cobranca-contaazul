import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const row = await prisma.chamadoConversaAssunto.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, assunto: row });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/conversas/:id GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
