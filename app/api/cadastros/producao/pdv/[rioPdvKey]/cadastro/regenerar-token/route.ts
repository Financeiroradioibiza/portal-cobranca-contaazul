import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { regenerarPdvInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";
import {
  resolvePortalPdvIdFromRioPdvKey,
  syncPlayerGatewayRegistryForPdvIds,
} from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { rioPdvKey: raw } = await ctx.params;
    const rioPdvKey = decodeURIComponent(raw ?? "").trim();
    if (!rioPdvKey) return NextResponse.json({ error: "invalid_key" }, { status: 400 });

    const token = await regenerarPdvInstalacaoToken(rioPdvKey);

    let gatewaySync: { clientes: number; pdvs: number } | null = null;
    let gatewaySyncError: string | null = null;

    if (cloud2Enabled()) {
      const portalPdvId = await resolvePortalPdvIdFromRioPdvKey(rioPdvKey);
      if (!portalPdvId) {
        gatewaySyncError = "pdv_sem_portal_id";
      } else {
        try {
          gatewaySync = await syncPlayerGatewayRegistryForPdvIds([portalPdvId]);
          if (gatewaySync.pdvs === 0) {
            gatewaySyncError = "sync_nenhum_pdv";
          }
        } catch (e) {
          gatewaySyncError = e instanceof Error ? e.message : "sync_falhou";
          console.error("[cadastro/regenerar-token] sync gateway falhou", {
            rioPdvKey,
            portalPdvId,
            err: e,
          });
        }
      }
    } else {
      gatewaySyncError = "cloud2_desabilitado";
    }

    return NextResponse.json({
      ok: true,
      playerInstalacaoToken: token,
      gatewaySync,
      gatewaySyncError,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cadastro/regenerar-token POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
