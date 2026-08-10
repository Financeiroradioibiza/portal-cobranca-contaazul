import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  deleteSiteClienteUsuario,
  updateSiteClienteUsuario,
} from "@/lib/site-cliente/siteClienteAdminService";
import type { SiteClientePermissoes } from "@/lib/site-cliente/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string; usuarioId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { usuarioId } = await ctx.params;
    const body = (await req.json()) as {
      nome?: string;
      telefone?: string;
      email?: string;
      funcao?: string;
      loginEmail?: string;
      password?: string;
      permissoes?: SiteClientePermissoes;
      active?: boolean;
    };
    await updateSiteClienteUsuario(usuarioId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (["senha_curta", "login_email_em_uso", "login_email_obrigatorio"].includes(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[suporte/site-clientes/usuario PATCH]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { usuarioId } = await ctx.params;
    await deleteSiteClienteUsuario(usuarioId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/usuario DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
