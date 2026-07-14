import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  BIBLIOTECA_PASTA_ICONES,
  createBibliotecaPasta,
  listBibliotecaPastas,
} from "@/lib/criacao/bibliotecaPastaService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const pastas = await listBibliotecaPastas();
    return NextResponse.json({ pastas, icones: BIBLIOTECA_PASTA_ICONES });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/pastas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      cor?: string;
      icone?: string;
    };
    const pasta = await createBibliotecaPasta({
      nome: body.nome ?? "",
      cor: body.cor,
      icone: body.icone,
      criativoUserId: session.email,
      criativoNome: session.displayName ?? session.email,
    });
    return NextResponse.json({ pasta }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[criacao/biblioteca/pastas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
