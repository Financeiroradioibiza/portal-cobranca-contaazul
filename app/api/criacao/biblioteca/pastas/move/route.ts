import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { moveMusicasEntreBibliotecaPastas } from "@/lib/criacao/bibliotecaPastaService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      dePastaId?: string | null;
      paraPastaId?: string;
      musicaIds?: string[];
    };
    if (!body.paraPastaId?.trim()) {
      return NextResponse.json({ error: "para_pasta_obrigatoria" }, { status: 400 });
    }
    const result = await moveMusicasEntreBibliotecaPastas({
      dePastaId: body.dePastaId ?? null,
      paraPastaId: body.paraPastaId.trim(),
      musicaIds: Array.isArray(body.musicaIds) ? body.musicaIds : [],
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "pasta_nao_encontrada") return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[criacao/biblioteca/pastas/move POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
