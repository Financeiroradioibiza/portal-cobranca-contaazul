import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  createPastaEspecial,
  listPastasEspeciais,
} from "@/lib/criacao/pastaEspecialService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const pastas = await listPastasEspeciais();
    return NextResponse.json({ pastas });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas-especiais GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      velocidade?: string;
      selecionavel?: boolean;
    };
    const created = await createPastaEspecial({
      nome: body.nome ?? "",
      velocidade: body.velocidade,
      selecionavel: body.selecionavel,
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[criacao/pastas-especiais POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
