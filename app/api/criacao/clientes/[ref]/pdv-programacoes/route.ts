import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  getClientePdvProgramacoes,
  savePdvProgramacaoAssignment,
  syncRegistryAfterPdvAssignment,
} from "@/lib/criacao/pdvProgramacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { ref } = await ctx.params;
    const payload = await getClientePdvProgramacoes(decodeURIComponent(ref));
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/clientes/:ref/pdv-programacoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { ref } = await ctx.params;
    const clienteRef = decodeURIComponent(ref);
    const body = (await request.json().catch(() => ({}))) as {
      rioPdvKey?: string;
      programacaoId?: string | null;
    };
    const rioPdvKey = String(body.rioPdvKey ?? "").trim();
    if (!rioPdvKey) {
      return NextResponse.json({ error: "parametros_invalidos" }, { status: 400 });
    }
    const programacaoId =
      body.programacaoId === null || body.programacaoId === "" ?
        null
      : String(body.programacaoId).trim() || null;

    await savePdvProgramacaoAssignment(clienteRef, rioPdvKey, programacaoId);

    const payload = await getClientePdvProgramacoes(clienteRef);
    const pdvRow = payload.pdvs.find((p) => p.rioPdvKey === rioPdvKey);
    if (payload.portalClienteId != null && pdvRow?.portalPdvId != null) {
      void syncRegistryAfterPdvAssignment(payload.portalClienteId, pdvRow.portalPdvId).catch((err) =>
        console.error("[pdv-programacoes] sync/signal", err),
      );
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (
      msg === "cliente_nao_encontrado" ||
      msg === "pdv_nao_encontrado" ||
      msg === "programacao_invalida"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[criacao/clientes/:ref/pdv-programacoes PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
