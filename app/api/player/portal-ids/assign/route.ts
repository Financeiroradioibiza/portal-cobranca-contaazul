import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  assignMissingPortalPlayerIdsBatch,
  realignPortalPlayerIdsBatch,
} from "@/lib/player/assignPortalPlayerIds";
import { generateMissingClientePlayerLogins } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      sync?: boolean;
      onlyMissing?: boolean;
      offset?: number;
      reset?: boolean;
    };

    const offset = Math.max(0, Math.floor(body.offset ?? 0));
    const result =
      body.onlyMissing ?
        await assignMissingPortalPlayerIdsBatch({ offset })
      : await realignPortalPlayerIdsBatch({
          offset,
          reset: body.reset === true || offset === 0,
        });

    let logins: { created: number; skipped: number } | null = null;
    let sync: { clientes: number; pdvs: number } | null = null;

    if (!result.hasMore) {
      if (!body.onlyMissing) {
        const lg = await generateMissingClientePlayerLogins();
        logins = { created: lg.created, skipped: lg.skipped };
      }
      if (body.sync !== false && cloud2Enabled()) {
        sync = await syncPlayerGatewayRegistry();
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      realigned: !body.onlyMissing,
      logins,
      gateway: sync,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[player/portal-ids/assign POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
