import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { createProspect, listProspects, parseEstagio } from "@/lib/cadastros/prospectService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const prospects = await listProspects();
    return NextResponse.json({ ok: true, prospects });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[prospects GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const prospect = await createProspect(
      {
        nome: str(body.nome),
        cidade: str(body.cidade),
        estado: str(body.estado),
        unidades: num(body.unidades, 1),
        origem: str(body.origem),
        statusNota: str(body.statusNota),
        valorCentavos: num(body.valorCentavos, 0),
        contatoNome: str(body.contatoNome),
        contatoEmail: str(body.contatoEmail),
        contatoTelefone: str(body.contatoTelefone),
        observacoes: str(body.observacoes),
      },
      ctx,
    );
    return NextResponse.json({ ok: true, prospect });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[prospects POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export { parseEstagio };
