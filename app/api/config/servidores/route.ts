import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { loadServidoresStatus } from "@/lib/infra/servidorStatusService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const status = await loadServidoresStatus();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/servidores GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
