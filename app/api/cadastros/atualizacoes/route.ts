import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import {
  conciliarPlayerCadastro,
  getPlayerIngest,
  linkPlayerIngestRioPdvKey,
  listPlayerIngest,
} from "@/lib/player/playerIngestService";
import { getOrCreatePdvCadastro } from "@/lib/cadastros/producaoPdvCadastroService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const row = await getPlayerIngest(id);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      let producao = null;
      if (row.rioPdvKey) {
        try {
          producao = await getOrCreatePdvCadastro(row.rioPdvKey, { refreshCobranca: false });
        } catch {
          producao = null;
        }
      }
      return NextResponse.json({ ok: true, row, producao });
    }

    const tipo = url.searchParams.get("tipo") === "feedback" ? "feedback" : "cadastro";
    const status = url.searchParams.get("status") === "conciliado" ? "conciliado" : "pendente";
    const rows = await listPlayerIngest({ tipo, status });
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cadastros/atualizacoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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

    const id = typeof body.id === "string" ? body.id : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });

    if (action === "link") {
      const rioPdvKey = typeof body.rioPdvKey === "string" ? body.rioPdvKey : "";
      const row = await linkPlayerIngestRioPdvKey(id, rioPdvKey);
      return NextResponse.json({ ok: true, row });
    }

    if (action === "conciliar") {
      const row = await conciliarPlayerCadastro(id, ctx);
      return NextResponse.json({ ok: true, row });
    }

    return NextResponse.json({ error: "acao_invalida" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (["tipo_invalido", "ja_conciliado", "pdv_nao_vinculado", "payload_vazio", "rio_pdv_key_obrigatorio"].includes(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[cadastros/atualizacoes PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
