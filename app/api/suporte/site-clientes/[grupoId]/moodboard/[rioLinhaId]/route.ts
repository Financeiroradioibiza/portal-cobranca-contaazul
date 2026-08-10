import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { upsertSiteClienteMoodboard } from "@/lib/site-cliente/siteClienteAdminService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string; rioLinhaId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId, rioLinhaId } = await ctx.params;
    const body = (await req.json()) as {
      portalClienteId?: number | null;
      perfilPublico?: string;
      posicionamentoMarca?: string;
      estiloMusicalPrincipal?: string;
      objetivoPeriodo?: string;
      notasInternas?: string;
    };
    await upsertSiteClienteMoodboard(grupoId, decodeURIComponent(rioLinhaId), body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/moodboard PUT]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
