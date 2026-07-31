import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { syncPastaFlagsProgramacao } from "@/lib/criacao/publicarService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Propaga storage_key da vinheta ao gateway (musicas) após upload — sem republicar faixas. */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const vinhetaId = id?.trim();
    if (!vinhetaId) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });

    const vinheta = await prisma.vinheta.findUnique({
      where: { id: vinhetaId },
      select: { programacaoId: true, storageKey: true },
    });
    if (!vinheta) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!vinheta.storageKey?.trim()) {
      return NextResponse.json({ error: "sem_audio" }, { status: 400 });
    }

    if (!vinheta.programacaoId) {
      return NextResponse.json({ error: "programacao_ausente" }, { status: 400 });
    }

    await syncPastaFlagsProgramacao(vinheta.programacaoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[criacao/vinhetas/:id/sync-gateway POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
