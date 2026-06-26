import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { triggerDownloadProcessing } from "@/lib/criacao/downloadService";

export async function POST() {
  try {
    requirePortalSession(await getPortalSession());
    const result = await triggerDownloadProcessing(30);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/sync-pending POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
