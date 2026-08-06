import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { deleteEmptyBibliotecaPastas } from "@/lib/criacao/bibliotecaPastaService";

export const runtime = "nodejs";

export async function POST() {
  try {
    requirePortalSession(await getPortalSession());
    const result = await deleteEmptyBibliotecaPastas();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/pastas/prune-empty POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
