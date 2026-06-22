import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { dispararAtualizacao } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const { id } = await ctx.params;
    const resultado = await dispararAtualizacao(id, session.displayName ?? session.email);
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
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
      msg === "gateway_clientes_falhou" ||
      msg === "sync_registry_falhou" ||
      msg === "publicar_timeout" ||
      msg.includes("sync_registry_timeout")
    ) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error("[criacao/programacoes/:id/disparar-atualizacao POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
