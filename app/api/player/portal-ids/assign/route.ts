import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  assignMissingPortalPlayerIds,
  realignPortalPlayerIds,
} from "@/lib/player/assignPortalPlayerIds";
import { generateMissingClientePlayerLogins } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      yearMonth?: number;
      sync?: boolean;
      /** true = só preenche faltantes (PDV novo); default = realinha tudo à produção */
      onlyMissing?: boolean;
      /** @deprecated use onlyMissing:false (default) */
      renumber?: boolean;
    };

    const onlyMissing = body.onlyMissing === true && body.renumber !== true;
    const result =
      onlyMissing ?
        await assignMissingPortalPlayerIds(body.yearMonth)
      : await realignPortalPlayerIds(body.yearMonth);

    let logins: { created: number; skipped: number } | null = null;
    if (!onlyMissing) {
      const lg = await generateMissingClientePlayerLogins(result.yearMonth);
      logins = { created: lg.created, skipped: lg.skipped };
    }

    let sync: { clientes: number; pdvs: number } | null = null;
    if (body.sync !== false && cloud2Enabled()) {
      sync = await syncPlayerGatewayRegistry(result.yearMonth);
    }

    return NextResponse.json({ ok: true, ...result, realigned: !onlyMissing, logins, gateway: sync });
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
