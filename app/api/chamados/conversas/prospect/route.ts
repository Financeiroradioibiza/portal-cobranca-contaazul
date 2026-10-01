import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { createConversaProspectAssunto } from "@/lib/chamados/conversaInboxService";

export async function POST(req: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await req.json()) as { nome?: string };
    const assunto = await createConversaProspectAssunto(body.nome ?? "", ctx);
    return NextResponse.json({ ok: true, assunto });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "nome_obrigatorio" || msg === "slug_invalido") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (String(e).includes("Unique constraint")) {
      return NextResponse.json({ error: "slug_duplicado" }, { status: 409 });
    }
    console.error("[chamados/conversas/prospect POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
