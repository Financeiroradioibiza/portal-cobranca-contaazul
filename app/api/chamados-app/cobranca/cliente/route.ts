import { NextResponse } from "next/server";
import { resolvePortalSessionForApi } from "@/lib/auth/portalSessionFromRequest";
import { isRouteAccessAllowed, resolveRouteAccessRule } from "@/lib/auth/routeAccess";
import { getChamadosCobrancaClienteDetail } from "@/lib/chamadosApp/cobrancaMobileService";

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

  const linhaId = new URL(request.url).searchParams.get("linhaId")?.trim() ?? "";
  if (!linhaId) {
    return NextResponse.json({ error: "linha_obrigatoria" }, { status: 400 });
  }

  const detail = await getChamadosCobrancaClienteDetail(linhaId);
  if (!detail) {
    return NextResponse.json({ error: "cliente_nao_encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...detail });
}
