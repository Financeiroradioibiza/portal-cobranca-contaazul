import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { listGatewayClientes } from "@/lib/criacao/publicarService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const clientes = await listGatewayClientes();
    return NextResponse.json({ clientes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/gateway-clientes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
