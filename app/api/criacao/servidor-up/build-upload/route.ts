import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  buildServidorUpUploadPlan,
  countStagingReadyForJob,
  type ServidorUpUploadDraftInput,
  type ServidorUpUploadTrackInput,
} from "@/lib/criacao/servidorUpUploadService";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      downloadJobId?: string;
      hierarchyRows?: ServidorUpHierarchyRow[];
      drafts?: Record<string, ServidorUpUploadDraftInput>;
      tracks?: ServidorUpUploadTrackInput[];
    };

    const downloadJobId = (body.downloadJobId ?? "").trim();
    const hierarchyRows = Array.isArray(body.hierarchyRows) ? body.hierarchyRows : [];
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    if (!downloadJobId) {
      return NextResponse.json({ error: "download_job_obrigatorio" }, { status: 400 });
    }
    if (tracks.length === 0) {
      return NextResponse.json({ error: "tracks_vazios" }, { status: 400 });
    }

    const plan = await buildServidorUpUploadPlan({
      downloadJobId,
      hierarchyRows,
      drafts: body.drafts,
      tracks,
    });

    const totalTracks = plan.lotes.reduce((n, l) => n + l.tracks.length, 0);
    const staging = await countStagingReadyForJob(downloadJobId);

    return NextResponse.json({
      ok: true,
      plan,
      stats: {
        lotes: plan.lotes.length,
        tracksMatched: totalTracks,
        unmatched: plan.unmatchedTracks.length,
        orphanDownloads: plan.orphanDownloadItems,
        hierarchyErrors: plan.hierarchyErrors.length,
        stagingReady: staging.stagingReady,
        concluidoTotal: staging.concluidoTotal,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/build-upload POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
