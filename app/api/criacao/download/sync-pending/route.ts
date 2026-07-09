import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { triggerDownloadProcessing } from "@/lib/criacao/downloadService";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      timeoutMs?: number;
    };
    const limit = Math.min(30, Math.max(1, body.limit ?? 8));
    const timeoutMs = Math.min(55_000, Math.max(5_000, body.timeoutMs ?? 45_000));
    const result = await triggerDownloadProcessing(limit, { timeoutMs });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/sync-pending POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
