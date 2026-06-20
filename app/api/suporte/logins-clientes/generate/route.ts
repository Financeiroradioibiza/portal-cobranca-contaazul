import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { generateMissingClientePlayerLoginsBatch } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      sync?: boolean;
      offset?: number;
      limit?: number;
    };

    const result = await generateMissingClientePlayerLoginsBatch({
      offset: body.offset,
      limit: body.limit,
    });

    let gateway: { clientes: number; pdvs: number } | null = null;
    if (body.sync !== false && cloud2Enabled() && !result.hasMore) {
      gateway = await syncPlayerGatewayRegistry();
    }

    return NextResponse.json({ ok: true, ...result, gateway });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[suporte/logins-clientes/generate POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
