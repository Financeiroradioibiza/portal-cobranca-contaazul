import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { patchProducaoSuporteEspelhoPdv } from "@/lib/cadastros/producaoSuporteEspelhoService";
import { regenerarPdvInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";
import { resetPlayerInstalacaoTelemetry } from "@/lib/player/resetPlayerInstalacaoTelemetry";
import {
  syncPlayerGatewayRegistryForPdvIds,
} from "@/lib/player/playerGatewaySync";
import { invalidarCodigosPlayPendentes } from "@/lib/suporte/instalacaoPlayService";
import {
  buildInstallLink,
  gerarSenhaTemporaria,
  GOOGLE_PLAY_PLAYER5_URL,
  registrarEnvio,
  resolveInstalacaoPdv,
  type InstalacaoPlataforma,
  type InstalacaoTipo,
} from "@/lib/suporte/instalacaoService";
import { gerarCodigoPlayInstalacao } from "@/lib/suporte/instalacaoPlayService";
import { loadInstalacaoGeracaoGate } from "@/lib/suporte/instalacaoPdvStatusService";
import { tipoUsaSenhaTemporaria } from "@/lib/suporte/instalacaoTipos";
import { assertSiteClientePdvInstalacaoAccess } from "@/lib/site-cliente/siteClienteEscopo";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

function actorFrom(session: SiteClienteSessionPayload): string {
  const who = session.nome?.trim() || session.loginEmail?.trim() || "site-cliente";
  return `site-cliente:${who}`.slice(0, 120);
}

export async function siteClienteRegenerarTokenPdv(
  session: SiteClienteSessionPayload,
  rioPdvKey: string,
) {
  const ids = await assertSiteClientePdvInstalacaoAccess(session, rioPdvKey);
  const token = await regenerarPdvInstalacaoToken(rioPdvKey);

  let codigosPlayInvalidados = 0;
  codigosPlayInvalidados = await invalidarCodigosPlayPendentes(
    ids.portalClienteId,
    ids.portalPdvId,
  );

  if (cloud2Enabled()) {
    try {
      await syncPlayerGatewayRegistryForPdvIds([ids.portalPdvId]);
      await resetPlayerInstalacaoTelemetry(ids.portalPdvId);
    } catch (e) {
      console.error("[site-cliente/regenerar-token] sync/reset", e);
    }
  }

  try {
    await patchProducaoSuporteEspelhoPdv(rioPdvKey, { resetTelemetry: true });
  } catch (e) {
    console.error("[site-cliente/regenerar-token] espelho", e);
  }

  return {
    ok: true as const,
    playerInstalacaoToken: token,
    codigosPlayInvalidados,
  };
}

export async function siteClienteInstalacaoContexto(
  session: SiteClienteSessionPayload,
  rioPdvKey: string,
) {
  const ids = await assertSiteClientePdvInstalacaoAccess(session, rioPdvKey);
  const ctx = await resolveInstalacaoPdv(ids.portalClienteId, ids.portalPdvId);
  if (!ctx) {
    throw new Response(JSON.stringify({ error: "pdv_nao_encontrado" }), { status: 404 });
  }

  const geracaoGate = await loadInstalacaoGeracaoGate({
    rioPdvKey: ctx.rioPdvKey,
    portalPdvId: ctx.portalPdvId,
    playerInstaladoEm: ctx.playerInstaladoEm,
  });

  return {
    ok: true as const,
    contexto: {
      portalClienteId: ctx.portalClienteId,
      portalPdvId: ctx.portalPdvId,
      codigoDisplay: ctx.codigoDisplay,
      pdvNome: ctx.pdvNome,
      clienteNome: ctx.clienteNome,
      rioPdvKey: ctx.rioPdvKey,
    },
    geracaoGate: {
      podeGerarLink: geracaoGate.podeGerarLink,
      pdvComPlayerAtivo: geracaoGate.pdvComPlayerAtivo,
      motivo: geracaoGate.motivo,
      errorCode: geracaoGate.errorCode,
    },
    programacaoAlert: geracaoGate.programacaoAlert,
  };
}

export async function siteClienteGerarLinkInstalacao(
  session: SiteClienteSessionPayload,
  rioPdvKey: string,
  tipo: InstalacaoTipo,
  plataforma: InstalacaoPlataforma,
) {
  const ids = await assertSiteClientePdvInstalacaoAccess(session, rioPdvKey);
  const ctx = await resolveInstalacaoPdv(ids.portalClienteId, ids.portalPdvId);
  if (!ctx) {
    throw new Response(JSON.stringify({ error: "pdv_nao_encontrado" }), { status: 404 });
  }

  const geracaoGate = await loadInstalacaoGeracaoGate({
    rioPdvKey: ctx.rioPdvKey,
    portalPdvId: ctx.portalPdvId,
    playerInstaladoEm: ctx.playerInstaladoEm,
  });

  if (!geracaoGate.podeGerarLink && geracaoGate.errorCode) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: geracaoGate.errorCode,
        detail: geracaoGate.motivo,
        pdvComPlayerAtivo: geracaoGate.pdvComPlayerAtivo,
      }),
      { status: 409 },
    );
  }

  const criadaPor = actorFrom(session);

  if (tipo === "pdv_play5") {
    const codigoPlay = await gerarCodigoPlayInstalacao({
      portalClienteId: ids.portalClienteId,
      portalPdvId: ids.portalPdvId,
      rioPdvKey: ctx.rioPdvKey,
      criadaPor,
    });
    await registrarEnvio({
      portalClienteId: ids.portalClienteId,
      portalPdvId: ids.portalPdvId,
      tipo: "pdv_play5",
      plataforma: "mobile",
      canal: "link",
      destinoEmail: "",
      link: `codigo:${codigoPlay}`,
      enviadoPor: criadaPor,
    });
    return {
      ok: true as const,
      tipo,
      plataforma,
      codigoPlay,
      playStoreUrl: GOOGLE_PLAY_PLAYER5_URL,
    };
  }

  if (tipo !== "pdv_senha_temp") {
    throw new Response(JSON.stringify({ error: "tipo_nao_permitido" }), { status: 400 });
  }

  const link = buildInstallLink(tipo, plataforma, {
    portalClienteId: ids.portalClienteId,
    portalPdvId: ids.portalPdvId,
  });

  let senhaTemporaria: string | undefined;
  if (tipoUsaSenhaTemporaria(tipo)) {
    senhaTemporaria = await gerarSenhaTemporaria(
      ids.portalClienteId,
      ids.portalPdvId,
      criadaPor,
    );
  }

  await registrarEnvio({
    portalClienteId: ids.portalClienteId,
    portalPdvId: ids.portalPdvId,
    tipo,
    plataforma,
    canal: "link",
    destinoEmail: "",
    link,
    enviadoPor: criadaPor,
  });

  return {
    ok: true as const,
    tipo,
    plataforma,
    link,
    senhaTemporaria,
  };
}
