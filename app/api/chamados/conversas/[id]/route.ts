import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  getConversaAssuntoDetail,
  updateConversaGrupoEmails,
} from "@/lib/chamados/conversaService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const assunto = await getConversaAssuntoDetail(id, session.email);
    if (!assunto) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, assunto });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/conversas/:id GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json()) as { grupoEmails?: unknown };

    if (!Object.prototype.hasOwnProperty.call(body, "grupoEmails")) {
      return NextResponse.json({ error: "grupo_emails_obrigatorio" }, { status: 400 });
    }

    const grupoEmails = await updateConversaGrupoEmails(id, body.grupoEmails, userCtx);
    const assunto = await getConversaAssuntoDetail(id, session.email);
    return NextResponse.json({ ok: true, grupoEmails, assunto });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    console.error("[chamados/conversas/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
