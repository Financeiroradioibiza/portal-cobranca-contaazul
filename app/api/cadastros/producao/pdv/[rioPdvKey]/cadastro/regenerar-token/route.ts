import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { regenerarPdvInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { rioPdvKey: raw } = await ctx.params;
    const rioPdvKey = decodeURIComponent(raw ?? "").trim();
    if (!rioPdvKey) return NextResponse.json({ error: "invalid_key" }, { status: 400 });

    const token = await regenerarPdvInstalacaoToken(rioPdvKey);

    if (cloud2Enabled()) {
      await syncPlayerGatewayRegistry().catch(() => null);
    }

    return NextResponse.json({ ok: true, playerInstalacaoToken: token });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cadastro/regenerar-token POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
