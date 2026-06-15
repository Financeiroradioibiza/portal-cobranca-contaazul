import { NextResponse } from "next/server";
import { requirePortalSession, getPortalSession } from "@/lib/auth/portalAccess";
import {
  callPlayerAvisosAdmin,
  parsePainelNumericId,
  type PlayerAvisosAction,
} from "@/lib/suporte/playerAvisosAdmin";

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
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!action || !email || !password) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const payload: Parameters<typeof callPlayerAvisosAdmin>[0] = {
    email,
    password,
    action,
  };

  if (action === "ativar" || action === "apagar") {
    const cliente_id = parsePainelNumericId(body.cliente_id);
    const pdv_id = parsePainelNumericId(body.pdv_id);
    if (cliente_id == null || pdv_id == null) {
      return NextResponse.json({ ok: false, error: "invalid_ids" }, { status: 400 });
    }
    payload.cliente_id = cliente_id;
    payload.pdv_id = pdv_id;
    if (action === "ativar") {
      const mensagem = typeof body.mensagem === "string" ? body.mensagem.trim() : "";
      if (!mensagem) {
        return NextResponse.json({ ok: false, error: "missing_message" }, { status: 400 });
      }
      payload.mensagem = mensagem.slice(0, 2000);
    }
  }

  try {
    const result = await callPlayerAvisosAdmin(payload);
    return NextResponse.json(result.data ?? { ok: false }, { status: result.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream_error";
    console.error("[suporte/player-avisos]", msg);
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502 });
  }
}
