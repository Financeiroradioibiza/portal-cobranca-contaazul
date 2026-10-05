import { NextResponse } from "next/server";
import { resolvePortalSessionForApi } from "@/lib/auth/portalSessionFromRequest";
import { isRouteAccessAllowed, resolveRouteAccessRule } from "@/lib/auth/routeAccess";

export const runtime = "nodejs";

/** Sessão mínima para o site chamados.radioibiza.app.br (sem menuPermissions). */
export async function GET(request: Request) {
  const session = await resolvePortalSessionForApi(request);
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const suporteRule = resolveRouteAccessRule("/api/suporte/instalacao");
  const producaoRule = resolveRouteAccessRule("/api/producao/dashboard");
  const cobrancaRule = resolveRouteAccessRule("/api/cobranca-aberta/send");
  const mobileSuporte =
    suporteRule ? isRouteAccessAllowed(suporteRule, session.roles) : false;
  const mobileProducao =
    producaoRule ? isRouteAccessAllowed(producaoRule, session.roles) : false;
  const mobileCobranca =
    cobrancaRule ? isRouteAccessAllowed(cobrancaRule, session.roles) : false;

  return NextResponse.json(
    {
      ok: true,
      email: session.email,
      displayName: session.displayName ?? session.email,
      roles: session.roles,
      mobileTools: {
        suporte: mobileSuporte,
        producao: mobileProducao,
        cobranca: mobileCobranca,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
