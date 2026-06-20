import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { regenerateAllClientePlayerEmailsBatch } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Regera e-mails curtos em massa (senhas mantidas). Endpoint temporário para migração. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      sync?: boolean;
      confirm?: boolean;
      offset?: number;
      limit?: number;
    };
    if (body.confirm !== true) {
      return NextResponse.json({ error: "confirmacao_obrigatoria" }, { status: 400 });
    }

    const result = await regenerateAllClientePlayerEmailsBatch({
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
    console.error("[suporte/logins-clientes/regenerate-emails POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
