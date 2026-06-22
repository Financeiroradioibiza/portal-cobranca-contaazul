import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const result = await syncPlayerGatewayRegistry();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[player/sync-gateway POST]", e);
    const status =
      msg.includes("cloud2_") || msg.includes("timeout") || msg.includes("abort") ? 502 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
