import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { buildServidorUpUploadPlan } from "@/lib/criacao/servidorUpUploadService";
import { buildServidorUpDownloadVerify } from "@/lib/criacao/servidorUpDownloadVerifyService";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";
import type { ServidorUpUploadDraftInput, ServidorUpUploadTrackInput } from "@/lib/criacao/servidorUpUploadService";

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

    const verify = await buildServidorUpDownloadVerify(downloadJobId, plan);

    return NextResponse.json({ ok: true, verify, stats: { tracks: verify.tracks.length } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/download-verify POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
