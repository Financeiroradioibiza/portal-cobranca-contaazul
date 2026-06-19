import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { updateClientePlayerLoginManual } from "@/lib/player/clientePlayerLoginService";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ portalClienteId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { portalClienteId: raw } = await ctx.params;
    const portalClienteId = Number(raw);
    if (!Number.isFinite(portalClienteId) || portalClienteId <= 0) {
      return NextResponse.json({ error: "id_invalido" }, { status: 400 });
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      clienteNome?: string;
      sync?: boolean;
    };

    await updateClientePlayerLoginManual(portalClienteId, body);

    if (body.sync !== false && cloud2Enabled()) {
      await syncPlayerGatewayRegistry();
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "login_nao_encontrado") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "email_invalido" || msg === "senha_curta") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[suporte/logins-clientes/:id PATCH]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
