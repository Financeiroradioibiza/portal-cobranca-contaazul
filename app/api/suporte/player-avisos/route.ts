import { NextResponse } from "next/server";
import { requirePortalSession, getPortalSession } from "@/lib/auth/portalAccess";
import {
  activatePlayerAviso,
  deletePlayerAvisosForPair,
  listPlayerAvisoRows,
  parsePortalPlayerNumericId,
  type PlayerAvisosAction,
} from "@/lib/suporte/playerAvisoService";

export const runtime = "nodejs";

function parseAction(raw: unknown): PlayerAvisosAction | null {
  if (raw === "listar" || raw === "ativar" || raw === "apagar") return raw;
  return null;
}

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const action = parseAction(body.action);
  if (!action) {
    return NextResponse.json({ ok: false, error: "acao_desconhecida" }, { status: 400 });
  }

  try {
    if (action === "listar") {
      const rows = await listPlayerAvisoRows();
      return NextResponse.json({ ok: true, rows });
    }

    const cliente_id = parsePortalPlayerNumericId(body.cliente_id);
    const pdv_id = parsePortalPlayerNumericId(body.pdv_id);
    if (cliente_id == null || pdv_id == null) {
      return NextResponse.json({ ok: false, error: "cliente_pdv_invalido" }, { status: 400 });
    }

    if (action === "ativar") {
      const mensagem = typeof body.mensagem === "string" ? body.mensagem.trim() : "";
      if (!mensagem) {
        return NextResponse.json({ ok: false, error: "mensagem_vazia" }, { status: 400 });
      }
      const rows = await activatePlayerAviso(cliente_id, pdv_id, mensagem);
      return NextResponse.json({ ok: true, rows });
    }

    const rows = await deletePlayerAvisosForPair(cliente_id, pdv_id);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "storage_falhou";
    console.error("[suporte/player-avisos]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
