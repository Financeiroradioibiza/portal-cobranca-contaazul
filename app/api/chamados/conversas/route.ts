import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  createConversaAssunto,
  listConversaAssuntos,
  searchConversas,
} from "@/lib/chamados/conversaService";

export async function GET(req: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q) {
      const assuntos = await searchConversas(q);
      return NextResponse.json({ ok: true, assuntos });
    }

    const assuntos = await listConversaAssuntos(ctx.email);
    return NextResponse.json({ ok: true, assuntos });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/conversas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await req.json()) as { titulo?: string; slug?: string };
    const assunto = await createConversaAssunto(
      { titulo: body.titulo ?? "", slug: body.slug },
      ctx,
    );
    return NextResponse.json({ ok: true, assunto });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "slug_invalido") {
      return NextResponse.json({ error: "slug_invalido" }, { status: 400 });
    }
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "slug_duplicado" }, { status: 409 });
    }
    console.error("[chamados/conversas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
