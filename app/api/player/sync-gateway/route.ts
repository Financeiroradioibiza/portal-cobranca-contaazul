import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import {
  syncPlayerGatewayRegistry,
  syncPlayerGatewayRegistryBatch,
  SYNC_PDV_BATCH_SIZE,
} from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      offset?: number;
      batchSize?: number;
      all?: boolean;
    };

    if (body.all === true) {
      const result = await syncPlayerGatewayRegistry();
      return NextResponse.json({ ok: true, done: true, ...result });
    }

    const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
    const batchSize = Math.min(
      20,
      Math.max(1, Math.floor(Number(body.batchSize) || SYNC_PDV_BATCH_SIZE)),
    );
    const result = await syncPlayerGatewayRegistryBatch(offset, batchSize);
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
