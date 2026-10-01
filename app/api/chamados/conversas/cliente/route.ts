import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { ensureConversaClienteAssunto } from "@/lib/chamados/conversaInboxService";

export async function POST(req: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await req.json()) as { clienteKey?: string };
    const assunto = await ensureConversaClienteAssunto(body.clienteKey ?? "", ctx);
    return NextResponse.json({ ok: true, assunto });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "cliente_key_obrigatorio") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "cliente_nao_encontrado") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[chamados/conversas/cliente POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
