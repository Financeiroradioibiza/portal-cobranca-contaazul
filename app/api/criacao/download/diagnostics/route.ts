import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getDownloadDiagnostics } from "@/lib/criacao/downloadService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const diagnostics = await getDownloadDiagnostics();
    return NextResponse.json(diagnostics);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/diagnostics GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
