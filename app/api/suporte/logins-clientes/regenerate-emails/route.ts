import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { regenerateAllClientePlayerEmails } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

/** Regera e-mails curtos em massa (senhas mantidas). Endpoint temporário para migração. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { sync?: boolean; confirm?: boolean };
    if (body.confirm !== true) {
      return NextResponse.json({ error: "confirmacao_obrigatoria" }, { status: 400 });
    }

    const result = await regenerateAllClientePlayerEmails();

    let gateway: { clientes: number; pdvs: number } | null = null;
    if (body.sync !== false && cloud2Enabled() && result.updated > 0) {
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
