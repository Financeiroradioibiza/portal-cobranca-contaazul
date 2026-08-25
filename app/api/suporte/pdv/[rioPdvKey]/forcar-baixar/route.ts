import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { forcarCachePlayerGateway } from "@/lib/player/forcarCachePlayerGateway";
import { resolvePortalPdvIdFromRioPdvKey } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!userHasRole(session.roles, "suporte") && !userHasRole(session.roles, "master")) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { rioPdvKey: raw } = await ctx.params;
    const rioPdvKey = decodeURIComponent(raw ?? "").trim();
    if (!rioPdvKey) return NextResponse.json({ error: "invalid_key" }, { status: 400 });

    if (!cloud2Enabled()) {
      return NextResponse.json({ ok: false, error: "cloud2_desabilitado" }, { status: 503 });
    }

    const portalPdvId = await resolvePortalPdvIdFromRioPdvKey(rioPdvKey);
    if (!portalPdvId) {
      return NextResponse.json({ ok: false, error: "pdv_sem_portal_id" }, { status: 400 });
    }

    const gateway = await forcarCachePlayerGateway([portalPdvId]);
    if (gateway.pdvs === 0) {
      return NextResponse.json({ ok: false, error: "gateway_sem_pdv" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, gateway });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/forcar-baixar POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
