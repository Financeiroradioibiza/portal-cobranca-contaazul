import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  createAgendaCompromisso,
  parseCompromissoAlarmeAtivo,
} from "@/lib/chamados/agendaCompromissoService";
import { flushAgendaCompromissoAlarms } from "@/lib/chamados/agendaCompromissoAlarmService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const titulo = typeof body.titulo === "string" ? body.titulo : "";
    const descricao = typeof body.descricao === "string" ? body.descricao : "";
    const inicioEm = typeof body.inicioEm === "string" ? body.inicioEm : "";
    const participantes = Array.isArray(body.participantes) ?
      body.participantes.filter((x): x is string => typeof x === "string")
    : [];

    const alarmeAtivo = parseCompromissoAlarmeAtivo(body.alarmeAtivo) ?? false;

    const compromisso = await createAgendaCompromisso(
      { titulo, descricao, inicioEm, participantes, alarmeAtivo },
      ctx,
    );
    await flushAgendaCompromissoAlarms();
    return NextResponse.json({ ok: true, compromisso });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "titulo_obrigatorio" || msg === "inicio_invalido") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[agenda/compromissos POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
