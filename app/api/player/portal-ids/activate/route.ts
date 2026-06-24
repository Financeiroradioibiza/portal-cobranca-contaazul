import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import {
  assignPortalPlayerIdsForBucketKey,
  assignPortalPlayerIdsForRioPdvKeys,
} from "@/lib/player/producaoPlayerBuckets";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { syncPlayerGatewayRegistryForPdvIds } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      rioPdvKey?: string;
      bucketKey?: string;
      sync?: boolean;
    };

    const sync = body.sync !== false;
    let result;

    if (body.bucketKey?.trim()) {
      result = await assignPortalPlayerIdsForBucketKey(body.bucketKey.trim());
    } else if (body.rioPdvKey?.trim()) {
      result = await assignPortalPlayerIdsForRioPdvKeys([body.rioPdvKey.trim()]);
    } else {
      return NextResponse.json({ error: "parametros_invalidos" }, { status: 400 });
    }

    let gateway: { clientes: number; pdvs: number } | null = null;
    const pdvIds = result.assigned.map((a) => a.portalPdvId);
    if (sync && cloud2Enabled() && pdvIds.length > 0) {
      gateway = await syncPlayerGatewayRegistryForPdvIds(pdvIds);
    }

    return NextResponse.json({
      ok: true,
      portalClienteId: result.portalClienteId,
      assigned: result.assigned.map((a) => ({
        ...a,
        display: formatPortalPdvIdDisplay(a.portalPdvId),
      })),
      gateway,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "pdv_nao_encontrado" || msg === "cliente_nao_encontrado" || msg === "parametros_invalidos") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "seq_player_ocupado") {
      return NextResponse.json(
        { error: msg, hint: "Conflito de numeração — use «Ativar IDs» no cliente ou IDs Player." },
        { status: 409 },
      );
    }
    console.error("[player/portal-ids/activate POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
