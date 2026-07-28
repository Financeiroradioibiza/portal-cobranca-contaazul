import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { repairDownloadStagingIfEmpty } from "@/lib/criacao/downloadService";

type Ctx = { params: Promise<{ id: string }> };

/** Netlify costuma cortar ~26s — manter reparo curto; sync Deemix roda em background. */
export const maxDuration = 26;

export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id: jobId } = await ctx.params;

    const repair = await repairDownloadStagingIfEmpty(jobId, { allowRequeue: true });

    return NextResponse.json({
      ok: true,
      restored: repair.restored,
      restoreScanned: repair.restoreScanned,
      restoreError: repair.restoreError,
      requeued: repair.requeued,
      stillReady: repair.stillReady,
      processingTriggered: repair.processingTriggered,
      processingError: null,
      needsCloud2Deploy: Boolean(
        repair.restoreError?.includes("404") || repair.restoreError?.includes("deploy"),
      ),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/:id/repair-staging POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
