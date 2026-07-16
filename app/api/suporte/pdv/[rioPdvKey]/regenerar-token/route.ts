import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { regenerarPdvInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";
import { invalidarCodigosPlayPendentes } from "@/lib/suporte/instalacaoPlayService";
import {
  resolvePortalPdvIdFromRioPdvKey,
  syncPlayerGatewayRegistryForPdvIds,
} from "@/lib/player/playerGatewaySync";
import { portalClienteIdFromPdvId } from "@/lib/player/portalPlayerIds";
import { resetPlayerInstalacaoTelemetry } from "@/lib/player/resetPlayerInstalacaoTelemetry";

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

    const portalPdvId = await resolvePortalPdvIdFromRioPdvKey(rioPdvKey);
    const token = await regenerarPdvInstalacaoToken(rioPdvKey);

    let codigosPlayInvalidados = 0;
    if (portalPdvId) {
      const portalClienteId = portalClienteIdFromPdvId(portalPdvId);
      codigosPlayInvalidados = await invalidarCodigosPlayPendentes(portalClienteId, portalPdvId);
    }

    let gatewaySync: { clientes: number; pdvs: number } | null = null;
    let gatewaySyncError: string | null = null;
    let telemetryReset = false;
    let telemetryResetError: string | null = null;

    if (cloud2Enabled()) {
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
          console.error("[suporte/regenerar-token] sync gateway falhou", {
            rioPdvKey,
            portalPdvId,
            err: e,
          });
        }

        try {
          await resetPlayerInstalacaoTelemetry(portalPdvId);
          telemetryReset = true;
        } catch (e) {
          telemetryResetError = e instanceof Error ? e.message : "reset_falhou";
          console.error("[suporte/regenerar-token] reset telemetria falhou", {
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
      codigosPlayInvalidados,
      gatewaySync,
      gatewaySyncError,
      telemetryReset,
      telemetryResetError,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/regenerar-token POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
