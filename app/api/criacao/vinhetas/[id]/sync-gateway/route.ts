import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";
import { signalPlayerProgramacaoUpdate } from "@/lib/player/signalPlayerProgramacaoUpdate";
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
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }

    const res = await cloud2FetchWithTimeout(
      "/sync-vinheta",
      {
        method: "POST",
        body: JSON.stringify({ vinhetaId }),
      },
      30_000,
    );
    const data = await parseCloud2Json<{ ok?: boolean; error?: string; detail?: string; musicaId?: number }>(
      res,
      "sync-vinheta",
    );
    if (!res?.ok || !data.ok) {
      const detail = data.detail?.trim();
      throw new Error(detail ? `${data.error ?? "sync_vinheta_falhou"}: ${detail}` : (data.error ?? "sync_vinheta_falhou"));
    }

    const prog = await prisma.programacao.findUnique({
      where: { id: vinheta.programacaoId },
      select: { clienteGatewayId: true },
    });
    if (prog?.clienteGatewayId) {
      await signalPlayerProgramacaoUpdate(prog.clienteGatewayId);
    }

    return NextResponse.json({ ok: true, musicaId: data.musicaId ?? null });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[criacao/vinhetas/:id/sync-gateway POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
