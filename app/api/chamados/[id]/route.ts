import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  getChamadoUserContext,
  parsePrioridade,
  parseStatus,
  parseStringArray,
  updateChamado,
} from "@/lib/chamados/chamadoService";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const { id } = await ctx.params;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const chamado = await updateChamado(
      id,
      {
        titulo: typeof body.titulo === "string" ? body.titulo : undefined,
        descricao: typeof body.descricao === "string" ? body.descricao : undefined,
        prioridade: parsePrioridade(body.prioridade) ?? undefined,
        status: parseStatus(body.status) ?? undefined,
        setores: body.setores !== undefined ? parseStringArray(body.setores) : undefined,
        responsaveis:
          body.responsaveis !== undefined ? parseStringArray(body.responsaveis) : undefined,
      },
      userCtx,
    );
    return NextResponse.json({ ok: true, chamado });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "titulo_obrigatorio") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[chamados PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
