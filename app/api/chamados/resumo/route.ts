import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadosResumoForUser } from "@/lib/chamados/chamadosResumo";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const resumo = await getChamadosResumoForUser(session.email);
    return NextResponse.json({ ok: true, resumo });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/resumo GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
