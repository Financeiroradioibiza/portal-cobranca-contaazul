import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  deleteServidorUpUploadSnapshot,
  getServidorUpUploadSnapshot,
  saveServidorUpUploadSnapshot,
} from "@/lib/criacao/servidorUpUploadSnapshotService";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { jobId } = await ctx.params;
    const snapshot = await getServidorUpUploadSnapshot(jobId);
    if (!snapshot) {
      return NextResponse.json({ error: "snapshot_nao_encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, session: snapshot });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/upload-session GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { jobId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as ServidorUpUploadSession;
    if (!body.tracks?.length || !body.hierarchyRows?.length) {
      return NextResponse.json({ error: "payload_invalido" }, { status: 400 });
    }
    const session: ServidorUpUploadSession = {
      ...body,
      downloadJobId: jobId,
      savedAt: Date.now(),
    };
    await saveServidorUpUploadSnapshot(jobId, session);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/upload-session PUT]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { jobId } = await ctx.params;
    await deleteServidorUpUploadSnapshot(jobId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/upload-session DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
