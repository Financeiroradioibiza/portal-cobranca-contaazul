import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  skipDownloadItemPick,
  triggerDownloadProcessing,
} from "@/lib/criacao/downloadService";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;

    let jobId: string;
    try {
      jobId = await skipDownloadItemPick(id);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "not_found") {
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        if (err.message === "nao_precisa_escolha" || err.message === "item_nao_aguardando") {
          return NextResponse.json({ error: err.message }, { status: 409 });
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
    console.error("[criacao/download/items/:id/skip POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
