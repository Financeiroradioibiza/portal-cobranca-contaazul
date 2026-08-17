import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listChamadoProducaoOpcoes } from "@/lib/chamados/chamadoProducaoOpcoes";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const clientes = await listChamadoProducaoOpcoes(q);
    return NextResponse.json({ ok: true, clientes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/producao-opcoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
