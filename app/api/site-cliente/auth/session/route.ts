import { NextResponse } from "next/server";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    return NextResponse.json({
      ok: true,
      grupoTipo: session.grupoTipo,
      grupoNome: session.grupoNome,
      nome: session.nome,
      permissoes: session.permissoes,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[site-cliente/auth/session GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
