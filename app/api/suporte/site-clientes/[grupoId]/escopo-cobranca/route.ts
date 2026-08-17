import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { setSiteClienteGrupoCobrancaEscopo } from "@/lib/site-cliente/siteClienteAdminService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId } = await ctx.params;
    const body = (await req.json()) as {
      caClientes?: Array<{
        caPersonId: string;
        documento?: string | null;
        razaoSocial?: string;
        nomeFantasia?: string;
        emailCobranca?: string | null;
        rioLinhaId?: string | null;
      }>;
    };
    await setSiteClienteGrupoCobrancaEscopo(grupoId, {
      caClientes: body.caClientes ?? [],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "grupo_nao_encontrado" || msg === "grupo_nao_e_cobranca") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[suporte/site-clientes/escopo-cobranca PUT]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
