import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { gerarPlaylist } from "@/lib/criacao/wizardService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { instrucao?: string; total?: number };
    const resultado = await gerarPlaylist(body.instrucao ?? "", body.total);
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/wizard POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
