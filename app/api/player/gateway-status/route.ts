import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { loadGatewayRegistryStatus } from "@/lib/player/playerGatewayRegistryStatus";

export const runtime = "nodejs";

function parseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => Math.trunc(Number(id))).filter((id) => id > 0))];
}

export async function GET() {
  return NextResponse.json(
    { error: "use_post", message: "Envie pdvIds e clienteIds via POST." },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      pdvIds?: unknown;
      clienteIds?: unknown;
    };
    const pdvIds = parseIds(body.pdvIds);
    const clienteIds = parseIds(body.clienteIds);

    if (pdvIds.length === 0 && clienteIds.length === 0) {
      return NextResponse.json({ ok: true, syncedPdvIds: [], syncedClienteIds: [] });
    }

    const status = await loadGatewayRegistryStatus(pdvIds, clienteIds);

    if (!status.ok) {
      return NextResponse.json({ error: status.error ?? "registry_check_falhou" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      syncedPdvIds: [...status.syncedPdvIds],
      syncedClienteIds: [...status.syncedClienteIds],
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[player/gateway-status POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
