import { NextResponse } from "next/server";
import { resolvePortalSessionForApi } from "@/lib/auth/portalSessionFromRequest";
import { isRouteAccessAllowed, resolveRouteAccessRule } from "@/lib/auth/routeAccess";
import { searchChamadosCobrancaClientes } from "@/lib/chamadosApp/cobrancaMobileService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await resolvePortalSessionForApi(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rule = resolveRouteAccessRule("/api/cobranca-aberta/send");
  if (rule && !isRouteAccessAllowed(rule, session.roles)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const clientes = await searchChamadosCobrancaClientes(q);
  return NextResponse.json({ ok: true, clientes });
}
