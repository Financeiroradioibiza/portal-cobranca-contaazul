import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { generateMissingClientePlayerLogins } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { yearMonth?: number; sync?: boolean };
    const result = await generateMissingClientePlayerLogins(body.yearMonth);

    let gateway: { clientes: number; pdvs: number } | null = null;
    if (body.sync !== false && cloud2Enabled() && result.created > 0) {
      gateway = await syncPlayerGatewayRegistry(result.yearMonth);
    }

    return NextResponse.json({ ok: true, ...result, gateway });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[suporte/logins-clientes/generate POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
