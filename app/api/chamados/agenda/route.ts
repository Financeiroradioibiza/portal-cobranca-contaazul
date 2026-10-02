import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listAgendaCompromissosForUser } from "@/lib/chamados/agendaCompromissoService";
import {
  listAgendaSequenciaTimelinesForUser,
  listChamadosAgendaForUser,
  listChamadosAgendaSemPrazoForUser,
} from "@/lib/chamados/chamadoAgendaService";

export async function GET(req: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!from || !to) {
      return NextResponse.json({ error: "from_to_obrigatorio" }, { status: 400 });
    }
    const includeFinalizados = url.searchParams.get("includeFinalizados") !== "0";
    const [items, sequencias, compromissos, semPrazo] = await Promise.all([
      listChamadosAgendaForUser(session.email, from, to, { includeFinalizados }),
      listAgendaSequenciaTimelinesForUser(session.email, from, to),
      listAgendaCompromissosForUser(session.email, from, to),
      listChamadosAgendaSemPrazoForUser(session.email),
    ]);
    return NextResponse.json({ ok: true, items, sequencias, compromissos, semPrazo });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/agenda GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
