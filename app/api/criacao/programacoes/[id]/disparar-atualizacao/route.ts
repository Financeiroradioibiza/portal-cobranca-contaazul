import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { dispararAtualizacao } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

function disparoErrorResponse(msg: string): NextResponse {
  if (msg === "programacao_nao_encontrada") {
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  if (
    msg === "nenhum_pdv_amarrado" ||
    msg === "cliente_gateway_nao_configurado" ||
    msg === "cloud2_desabilitado"
  ) {
    return NextResponse.json({ error: msg }, { status: 400 });
  }
    if (
      msg === "publicar_falhou" ||
      msg === "falha_publicacao" ||
      msg.startsWith("falha_publicacao:") ||
      msg.startsWith("publicar_falhou:") ||
    msg === "cliente_gateway_inexistente" ||
    msg === "gateway_clientes_falhou" ||
    msg === "publicar_timeout" ||
    msg.startsWith("sync_registry") ||
    msg.startsWith("cloud2_")
  ) {
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      tipoSubida?: "atl" | "especial";
      especialNome?: string;
    };
    const resultado = await dispararAtualizacao(id, session.displayName ?? session.email, {
      tipoSubida: body.tipoSubida,
      especialNome: body.especialNome,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "especial_nome_obrigatorio") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[criacao/programacoes/:id/disparar-atualizacao POST]", e);
    return disparoErrorResponse(msg);
  }
}
