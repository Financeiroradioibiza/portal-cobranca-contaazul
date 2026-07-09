import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listServidorUpUploadSnapshots } from "@/lib/criacao/servidorUpUploadSnapshotService";
import { listDownloadJobs } from "@/lib/criacao/downloadService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const [snapshots, deemixJobs] = await Promise.all([
      listServidorUpUploadSnapshots(30),
      listDownloadJobs({ provider: "deemix", limit: 30 }),
    ]);
    const servidorUpJobs = deemixJobs.filter((j) => /servidor\s*up/i.test(j.titulo));
    return NextResponse.json({ ok: true, snapshots, servidorUpJobs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/upload-sessions GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
