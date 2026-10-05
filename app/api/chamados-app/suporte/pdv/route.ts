import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortalSessionForApi } from "@/lib/auth/portalSessionFromRequest";
import { isRouteAccessAllowed, resolveRouteAccessRule } from "@/lib/auth/routeAccess";
import { userHasRole } from "@/lib/auth/roles";
import { resolveInstalacaoPdv } from "@/lib/suporte/instalacaoService";
import {
  loadInstalacaoGeracaoGate,
  loadInstalacaoPdvStatus,
} from "@/lib/suporte/instalacaoPdvStatusService";
import { loadProducaoSuporteEspelho } from "@/lib/cadastros/producaoSuporteEspelhoService";
import { effectiveRioTagCobranca } from "@/lib/rio/rioTagCobranca";

export const runtime = "nodejs";

function parseId(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Ficha PDV para o app chamados (Suporte). */
export async function GET(request: Request) {
  const session = await resolvePortalSessionForApi(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rule = resolveRouteAccessRule("/api/suporte/instalacao");
  if (rule && !isRouteAccessAllowed(rule, session.roles)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const portalClienteId = parseId(url.searchParams.get("portalClienteId"));
  const portalPdvId = parseId(url.searchParams.get("portalPdvId"));
  if (portalClienteId == null || portalPdvId == null) {
    return NextResponse.json({ error: "cliente_pdv_invalido" }, { status: 400 });
  }

  const ctx = await resolveInstalacaoPdv(portalClienteId, portalPdvId);
  if (!ctx) {
    return NextResponse.json({ error: "pdv_nao_encontrado" }, { status: 404 });
  }

  const canRegenerarToken =
    userHasRole(session.roles, "suporte") || userHasRole(session.roles, "master");

  const geracaoGate = await loadInstalacaoGeracaoGate({
    rioPdvKey: ctx.rioPdvKey,
    portalPdvId: ctx.portalPdvId,
    playerInstaladoEm: ctx.playerInstaladoEm,
  });

  const cadastro = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey: ctx.rioPdvKey },
    select: {
      cnpj: true,
      programacaoId: true,
      programacao: { select: { id: true, nome: true, criativoNome: true, publicada: true } },
    },
  });

  const pdvStatus = await loadInstalacaoPdvStatus({
    rioPdvKey: ctx.rioPdvKey,
    portalPdvId: ctx.portalPdvId,
    pdvNome: ctx.pdvNome,
    codigoDisplay: ctx.codigoDisplay,
  });

  const alert = geracaoGate.programacaoAlert;
  const progOk =
    alert.programacaoAmarrada && alert.programacaoFechada !== false && Boolean(alert.programacaoNome);

  let tagCobrancaEfetiva: ReturnType<typeof effectiveRioTagCobranca> = "cobrando";
  try {
    const { payload } = await loadProducaoSuporteEspelho();
    const supRow = payload.pdvs.find(
      (p) => p.rioPdvKey === ctx.rioPdvKey || p.portalPdvId === portalPdvId,
    );
    if (supRow) {
      tagCobrancaEfetiva = effectiveRioTagCobranca(supRow.tagCobranca, supRow.clienteTagCobranca);
    }
  } catch {
    //
  }

  return NextResponse.json({
    ok: true,
    canRegenerarToken,
    geracaoGate,
    programacaoAlert: alert,
    programacaoOk: progOk,
    pdvStatus,
    tagCobrancaEfetiva,
    pdv: {
      portalClienteId: ctx.portalClienteId,
      portalPdvId: ctx.portalPdvId,
      codigoDisplay: ctx.codigoDisplay,
      clienteNome: ctx.clienteNome,
      pdvNome: ctx.pdvNome,
      rioPdvKey: ctx.rioPdvKey,
      cnpj: cadastro?.cnpj?.trim() || "",
      contatoLojaNome: ctx.contatoLojaNome,
      contatoLojaEmail: ctx.contatoLojaEmail,
      contatoLojaTelefone: ctx.contatoLojaTelefone,
      playerInstaladoEm: ctx.playerInstaladoEm,
      podeGerarCodigoPlay: ctx.podeGerarCodigoPlay,
      donoProgramacao: cadastro?.programacao?.criativoNome?.trim() || "",
      programacaoId: cadastro?.programacaoId ?? null,
      programacaoNome: alert.programacaoNome ?? cadastro?.programacao?.nome ?? null,
    },
  });
}
