import { NextResponse } from "next/server";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";
import {
  siteClienteGerarLinkInstalacao,
  siteClienteInstalacaoContexto,
} from "@/lib/site-cliente/siteClientePdvInstalacaoService";
import type { InstalacaoPlataforma, InstalacaoTipo } from "@/lib/suporte/instalacaoService";

export const runtime = "nodejs";

function parseTipo(raw: unknown): InstalacaoTipo | null {
  if (raw === "pdv_senha_temp" || raw === "pdv_play5") return raw;
  return null;
}

function parsePlataforma(raw: unknown): InstalacaoPlataforma | null {
  return raw === "windows" || raw === "mobile" ? raw : null;
}

export async function POST(request: Request) {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const action = typeof body.action === "string" ? body.action : "";
    const rioPdvKey = typeof body.rioPdvKey === "string" ? body.rioPdvKey.trim() : "";
    if (!rioPdvKey) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
    }

    if (action === "contexto") {
      const payload = await siteClienteInstalacaoContexto(session, rioPdvKey);
      return NextResponse.json(payload);
    }

    if (action === "gerar_link") {
      const tipo = parseTipo(body.tipo);
      const plataforma = parsePlataforma(body.plataforma);
      if (!tipo || !plataforma) {
        return NextResponse.json({ ok: false, error: "tipo_plataforma_invalido" }, { status: 400 });
      }
      const payload = await siteClienteGerarLinkInstalacao(session, rioPdvKey, tipo, plataforma);
      return NextResponse.json(payload);
    }

    return NextResponse.json({ ok: false, error: "action_invalida" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message === "pdv_com_player_instalado") {
      return NextResponse.json({ ok: false, error: "pdv_com_player_instalado" }, { status: 409 });
    }
    console.error("[site-cliente/pdv/instalacao POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
