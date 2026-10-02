import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listChamadoParticipants, getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { CHAMADO_SETORES } from "@/lib/chamados/chamadoConstants";
import { emailsForChamadoSetor } from "@/lib/chamados/chamadoSetorPessoas";
import {
  buildDefaultClienteNovoSteps,
  buildDefaultVinhetasSteps,
  defaultVinhetasRafaelEmail,
  type PrazoModo,
} from "@/lib/chamados/chamadoTemplateSequencia";

export const runtime = "nodejs";

const PRAZO_MODOS = new Set<PrazoModo>(["um_dia_util", "dois_dias_uteis", "data_instalacao"]);

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const template = url.searchParams.get("template")?.trim() ?? "";
    if (template !== "cliente_novo" && template !== "vinhetas") {
      return NextResponse.json({ error: "template_invalido" }, { status: 400 });
    }

    const participants = await listChamadoParticipants();
    let steps;
    if (template === "vinhetas") {
      steps = buildDefaultVinhetasSteps(new Date(), defaultVinhetasRafaelEmail(participants), 2);
    } else {
      const rawModo = url.searchParams.get("prazoModo")?.trim() ?? "um_dia_util";
      const prazoModo: PrazoModo = PRAZO_MODOS.has(rawModo as PrazoModo) ? (rawModo as PrazoModo) : "um_dia_util";
      const dataInstalacao = url.searchParams.get("dataInstalacao")?.trim() ?? "";
      steps = buildDefaultClienteNovoSteps(
        new Date(),
        prazoModo,
        prazoModo === "data_instalacao" && dataInstalacao ? dataInstalacao : undefined,
      );
    }

    const setorEmails: Record<string, string[]> = {};
    for (const s of CHAMADO_SETORES) {
      setorEmails[s.id] = emailsForChamadoSetor(s.id);
    }

    return NextResponse.json({
      ok: true,
      template,
      steps,
      setorEmails,
      setores: CHAMADO_SETORES.map((s) => ({ id: s.id, label: s.label })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/template-defaults GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
