import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  confirmDownloadItemPick,
  triggerDownloadProcessing,
} from "@/lib/criacao/downloadService";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;

    let body: { trackUrl?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (!body.trackUrl?.trim()) {
      return NextResponse.json({ error: "track_url_obrigatorio" }, { status: 400 });
    }

    let jobId: string;
    try {
      jobId = await confirmDownloadItemPick(id, body.trackUrl);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "not_found") {
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        if (err.message === "nao_precisa_escolha" || err.message === "item_nao_aguardando") {
          return NextResponse.json({ error: err.message }, { status: 409 });
        }
        if (err.message === "url_invalida") {
          return NextResponse.json({ error: "url_invalida" }, { status: 400 });
        }
      }
      throw err;
    }

    const proc = await triggerDownloadProcessing(5);

    return NextResponse.json({
      ok: true,
      jobId,
      processingTriggered: proc.triggered,
      processingError: proc.error ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/items/:id/pick POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
