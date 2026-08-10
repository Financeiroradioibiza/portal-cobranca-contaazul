import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  deleteSiteClienteGrupo,
  getSiteClienteGrupo,
  updateSiteClienteGrupo,
} from "@/lib/site-cliente/siteClienteAdminService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId } = await ctx.params;
    const grupo = await getSiteClienteGrupo(grupoId);
    if (!grupo) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, grupo });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/[grupoId] GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId } = await ctx.params;
    const body = (await req.json()) as { nome?: string; active?: boolean };
    await updateSiteClienteGrupo(grupoId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[suporte/site-clientes/[grupoId] PATCH]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId } = await ctx.params;
    await deleteSiteClienteGrupo(grupoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/[grupoId] DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
