import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { deletePasta, updatePasta } from "@/lib/criacao/programacaoService";
import { syncPastaFlagsProgramacao } from "@/lib/criacao/publicarService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      velocidade?: string;
      selecionavel?: boolean;
      prioritaria?: boolean;
    };
    const ok = await updatePasta(id, body);
    if (typeof body.selecionavel === "boolean" || typeof body.prioritaria === "boolean") {
      const pasta = await prisma.pasta.findUnique({
        where: { id },
        select: { programacaoId: true },
      });
      if (pasta?.programacaoId) {
        await syncPastaFlagsProgramacao(pasta.programacaoId).catch((e) => {
          console.error("[criacao/pastas/:id PATCH] sync-pasta-flags", e);
        });
      }
    }
    return NextResponse.json({ ok });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    await deletePasta(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
