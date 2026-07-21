import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  countDownloadStagingReady,
  requeueDownloadItemsMissingStorage,
  triggerDownloadProcessing,
  triggerRestoreDownloadStaging,
} from "@/lib/criacao/downloadService";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id: jobId } = await ctx.params;

    const restore = await triggerRestoreDownloadStaging(jobId);
    let stillReady = await countDownloadStagingReady(jobId);

    let requeued = 0;
    if (stillReady === 0) {
      const rq = await requeueDownloadItemsMissingStorage(jobId);
      requeued = rq.requeued;
      stillReady = rq.stillReady;
    } else {
      stillReady = await countDownloadStagingReady(jobId);
    }

    let processing: { triggered: boolean; error?: string } = { triggered: false };
    if (requeued > 0) {
      processing = await triggerDownloadProcessing(Math.min(15, requeued), { timeoutMs: 45_000 });
    }

    return NextResponse.json({
      ok: true,
      restored: restore.restored,
      restoreScanned: restore.scanned,
      restoreError: restore.error ?? null,
      requeued,
      stillReady,
      processingTriggered: processing.triggered,
      processingError: processing.error ?? null,
      needsCloud2Deploy: Boolean(restore.error?.includes("404") || restore.error?.includes("deploy")),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/:id/repair-staging POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
