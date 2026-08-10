import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { setSiteClienteGrupoEscopo } from "@/lib/site-cliente/siteClienteAdminService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId } = await ctx.params;
    const body = (await req.json()) as {
      clientes?: Array<{ rioLinhaId: string; portalClienteId?: number | null }>;
      pdvs?: Array<{ rioPdvKey: string; portalPdvId?: number | null }>;
    };
    await setSiteClienteGrupoEscopo(grupoId, {
      clientes: body.clientes ?? [],
      pdvs: body.pdvs ?? [],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/escopo PUT]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
