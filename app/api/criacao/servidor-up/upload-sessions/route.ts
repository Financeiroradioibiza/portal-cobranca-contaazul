import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listServidorUpUploadSnapshots } from "@/lib/criacao/servidorUpUploadSnapshotService";
import { listDownloadJobs } from "@/lib/criacao/downloadService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const [snapshotsResult, deemixResult] = await Promise.allSettled([
      listServidorUpUploadSnapshots(30),
      listDownloadJobs({ provider: "deemix", limit: 30 }),
    ]);
    const snapshots = snapshotsResult.status === "fulfilled" ? snapshotsResult.value : [];
    const deemixJobs =
      deemixResult.status === "fulfilled" ? deemixResult.value : [];
    if (snapshotsResult.status === "rejected") {
      console.error("[criacao/servidor-up/upload-sessions] snapshots", snapshotsResult.reason);
    }
    if (deemixResult.status === "rejected") {
      console.error("[criacao/servidor-up/upload-sessions] deemixJobs", deemixResult.reason);
    }
    const servidorUpJobs = deemixJobs.filter((j) => /servidor\s*up/i.test(j.titulo));
    return NextResponse.json({ ok: true, snapshots, servidorUpJobs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/upload-sessions GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
