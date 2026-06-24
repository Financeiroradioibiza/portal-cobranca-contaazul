import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  getClientePdvProgramacoes,
  savePdvProgramacaoAssignment,
  shouldDeferGatewayVerifyOnPdvAssignment,
  syncRegistryAfterPdvAssignment,
} from "@/lib/criacao/pdvProgramacaoService";
import type { SyncPdvProgramacaoResult } from "@/lib/criacao/pdvProgramacaoService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ ref: string }> };

function gatewaySyncHint(error: string): string {
  if (error === "programacao_nao_publicada_no_gateway") {
    return "Programação ainda não está no Player 5 — use Fechar atualização ou publique antes de trocar PDV em programação já encerrada.";
  }
  if (error === "programa_gateway_desalinhado" || error.startsWith("programa_gateway_desalinhado:")) {
    return "Gateway desalinhado — publique/dispare a programação ou use sync gateway.";
  }
  if (error === "pdv_nao_sincronizado_gateway") {
    return "PDV ainda não existe no gateway — rode sync gateway e tente de novo.";
  }
  if (error === "sync_nenhum_pdv") {
    return "Nenhum PDV foi sincronizado — verifique ID Player no cadastro.";
  }
  if (error === "programa_gateway_deveria_estar_vazio") {
    return "Gateway ainda tem programação amarrada — sync gateway ou remova no suporte.";
  }
  return "Falha ao sincronizar com o Player 5. A amarração foi revertida no portal.";
}

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

    const payloadBefore = await getClientePdvProgramacoes(clienteRef);
    const pdvRowBefore = payloadBefore.pdvs.find((p) => p.rioPdvKey === rioPdvKey);
    const previousProgramacaoId = pdvRowBefore?.programacaoId ?? null;

    await savePdvProgramacaoAssignment(clienteRef, rioPdvKey, programacaoId);

    let gatewaySync: SyncPdvProgramacaoResult | null = null;
    const deferGatewayVerify = await shouldDeferGatewayVerifyOnPdvAssignment(
      programacaoId,
      previousProgramacaoId,
    );

    if (
      !deferGatewayVerify &&
      payloadBefore.portalClienteId != null &&
      pdvRowBefore?.portalPdvId != null &&
      cloud2Enabled()
    ) {
      try {
        gatewaySync = await syncRegistryAfterPdvAssignment(
          payloadBefore.portalClienteId,
          pdvRowBefore.portalPdvId,
          programacaoId,
        );
      } catch (e) {
        const gatewaySyncError = e instanceof Error ? e.message : "sync_falhou";
        console.error("[pdv-programacoes] sync/verify — revertendo amarração no portal", e);
        try {
          await savePdvProgramacaoAssignment(clienteRef, rioPdvKey, previousProgramacaoId);
        } catch (revertErr) {
          console.error("[pdv-programacoes] falha ao reverter amarração", revertErr);
        }
        const payload = await getClientePdvProgramacoes(clienteRef);
        return NextResponse.json(
          {
            ok: false,
            error: gatewaySyncError,
            hint: gatewaySyncHint(gatewaySyncError),
            ...payload,
          },
          { status: 502 },
        );
      }
    }

    const payload = await getClientePdvProgramacoes(clienteRef);
    return NextResponse.json({ ok: true, gatewaySync, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (
      msg === "cliente_nao_encontrado" ||
      msg === "pdv_nao_encontrado" ||
      msg === "programacao_invalida" ||
      msg === "programacao_nao_publicada_no_gateway" ||
      msg === "programa_gateway_desalinhado" ||
      msg === "pdv_nao_sincronizado_gateway" ||
      msg === "sync_nenhum_pdv" ||
      msg.startsWith("programa_gateway_desalinhado:")
    ) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error("[criacao/clientes/:ref/pdv-programacoes PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
