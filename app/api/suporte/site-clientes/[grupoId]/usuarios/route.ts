import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { createSiteClienteUsuario } from "@/lib/site-cliente/siteClienteAdminService";
import type { SiteClientePermissoes } from "@/lib/site-cliente/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId } = await ctx.params;
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
    const created = await createSiteClienteUsuario(grupoId, {
      nome: body.nome ?? "",
      telefone: body.telefone,
      email: body.email ?? "",
      funcao: body.funcao,
      loginEmail: body.loginEmail ?? "",
      password: body.password ?? "",
      permissoes: body.permissoes,
      active: body.active,
    });
    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (["login_senha_obrigatorios", "senha_curta", "login_email_em_uso"].includes(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[suporte/site-clientes/usuarios POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
