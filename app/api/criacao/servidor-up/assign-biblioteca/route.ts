import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  assignServidorUpBibliotecaTracks,
  type ServidorUpAssignBibliotecaItem,
} from "@/lib/criacao/servidorUpAssignBibliotecaService";

export const maxDuration = 60;

/** Assign-only: coloca faixa existente na pasta + tag (sem Deemix/fila). */
export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      items?: ServidorUpAssignBibliotecaItem[];
    };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "items_vazios" }, { status: 400 });
    }
    if (items.length > 200) {
      return NextResponse.json({ error: "limite_200" }, { status: 400 });
    }

    const result = await assignServidorUpBibliotecaTracks({
      items,
      uploaderEmail: session.email,
      uploaderDisplayName: session.displayName ?? session.email,
    });
    return NextResponse.json({ ok: result.ok, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/assign-biblioteca POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
