import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  createChamado,
  getChamadoUserContext,
  listAllChamados,
  listChamadosForUser,
  listOpenChamadosForUser,
  parsePrioridade,
  parseStringArray,
} from "@/lib/chamados/chamadoService";

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const scope = new URL(request.url).searchParams.get("scope");
    const chamados =
      scope === "mine" ? await listOpenChamadosForUser(ctx)
      : scope === "mine-all" ? await listChamadosForUser(ctx)
      : await listAllChamados();
    return NextResponse.json({ ok: true, chamados });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const titulo = typeof body.titulo === "string" ? body.titulo : "";
    const descricao = typeof body.descricao === "string" ? body.descricao : "";
    const prioridade = parsePrioridade(body.prioridade) ?? "media";
    const setores = parseStringArray(body.setores);
    const responsaveis = parseStringArray(body.responsaveis);
    const rioLinhaId = typeof body.rioLinhaId === "string" ? body.rioLinhaId : null;
    const rioPdvKey = typeof body.rioPdvKey === "string" ? body.rioPdvKey : null;
    const clienteNome = typeof body.clienteNome === "string" ? body.clienteNome : "";

    const chamado = await createChamado(
      { titulo, descricao, prioridade, setores, responsaveis, rioLinhaId, rioPdvKey, clienteNome },
      ctx,
    );
    return NextResponse.json({ ok: true, chamado });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "titulo_obrigatorio") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[chamados POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
