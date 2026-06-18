import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { publicarProgramacao } from "@/lib/criacao/publicarService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { clienteIdGateway?: number };
    const clienteIdGateway = Number(body.clienteIdGateway);
    if (!Number.isFinite(clienteIdGateway) || clienteIdGateway <= 0) {
      return NextResponse.json({ error: "cliente_gateway_obrigatorio" }, { status: 400 });
    }
    const resultado = await publicarProgramacao(id, clienteIdGateway);
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "publicar_falhou" || msg === "gateway_clientes_falhou") {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error("[criacao/programacoes/:id/publicar POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
