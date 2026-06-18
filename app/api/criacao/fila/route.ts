import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listJobs } from "@/lib/criacao/filaService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    await applyPendingUploadTags().catch(() => {});
    await applyPendingPastaUploads().catch(() => {});
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const jobs = await listJobs({ status, limit: 100 });
    return NextResponse.json({ jobs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
