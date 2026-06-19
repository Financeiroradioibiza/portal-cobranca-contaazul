import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  assignMissingPortalPlayerIds,
  assignPortalPlayerIds,
} from "@/lib/player/assignPortalPlayerIds";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      yearMonth?: number;
      sync?: boolean;
      /** true = renumeração alfabética destrutiva (migração inicial) */
      renumber?: boolean;
    };
    const result =
      body.renumber ?
        await assignPortalPlayerIds(body.yearMonth)
      : await assignMissingPortalPlayerIds(body.yearMonth);

    let sync: { clientes: number; pdvs: number } | null = null;
    if (body.sync !== false && cloud2Enabled()) {
      sync = await syncPlayerGatewayRegistry(result.yearMonth);
    }

    return NextResponse.json({ ok: true, ...result, gateway: sync });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "rio_month_not_found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[player/portal-ids/assign POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
