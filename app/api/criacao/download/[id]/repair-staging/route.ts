import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  requeueDownloadItemsMissingStorage,
  triggerDownloadProcessing,
} from "@/lib/criacao/downloadService";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id: jobId } = await ctx.params;
    const { requeued, stillReady } = await requeueDownloadItemsMissingStorage(jobId);

    let processing: { triggered: boolean; error?: string } = { triggered: false };
    if (requeued > 0) {
      processing = await triggerDownloadProcessing(Math.min(15, requeued), { timeoutMs: 45_000 });
    }

    return NextResponse.json({
      ok: true,
      requeued,
      stillReady,
      processingTriggered: processing.triggered,
      processingError: processing.error ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/:id/repair-staging POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
