import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { amarrarPdvsDisparoBatch } from "@/lib/criacao/atualizacaoService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

function amarrarErrorResponse(msg: string): NextResponse {
  if (msg === "programacao_nao_encontrada") {
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  if (
    msg === "nenhum_pdv_amarrado" ||
    msg === "batch_index_invalido" ||
    msg === "cloud2_desabilitado"
  ) {
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (
    msg === "link_pdv_rota_ausente" ||
    msg.startsWith("link_pdv") ||
    msg.startsWith("sync_registry") ||
    msg.startsWith("sync_") ||
    msg.startsWith("programa_gateway_desalinhado") ||
    msg.startsWith("pdv_programa_nao_amarrado") ||
    msg.startsWith("cloud2_")
  ) {
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { batchIndex?: number };
    const batchIndex = Number(body.batchIndex);
    if (!Number.isInteger(batchIndex) || batchIndex < 0) {
      return NextResponse.json({ error: "batch_index_invalido" }, { status: 400 });
    }
    const resultado = await amarrarPdvsDisparoBatch(id, batchIndex);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("[criacao/programacoes/:id/disparar-atualizacao/amarrar-pdvs POST]", e);
    return amarrarErrorResponse(msg);
  }
}
