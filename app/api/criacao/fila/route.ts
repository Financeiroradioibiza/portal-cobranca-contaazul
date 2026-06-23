import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listJobs } from "@/lib/criacao/filaService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const jobs = await listJobs({ status, limit: 100 });
    return NextResponse.json({ jobs });
  } catch (e) {
    if (e instanceof Response) return e;
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[criacao/fila GET]", detail, e);
    return NextResponse.json({ error: "server_error", detail }, { status: 500 });
  }
}
