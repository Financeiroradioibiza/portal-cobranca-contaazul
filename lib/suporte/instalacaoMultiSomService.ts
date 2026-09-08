import {
  gerarSenhaTemporaria,
  player5Origin,
  portalClienteIdFromPdvId,
  resolveInstalacaoPdv,
} from "@/lib/suporte/instalacaoService";
import { loadInstalacaoGeracaoGate } from "@/lib/suporte/instalacaoPdvStatusService";

export type MultiSomSlotResult = {
  portalPdvId: number;
  portalClienteId: number;
  codigoDisplay: string;
  pdvNome: string;
  senhaTemporaria: string;
};

export type MultiSomInstalacaoResult = {
  slotCount: number;
  slots: MultiSomSlotResult[];
  exeUrl: string;
  installArg: string;
  installCommand: string;
};

export function buildMultiSomInstallerExeUrl(): string {
  return `${player5Origin()}/install/RadioIbiza-MultiSom-Setup.exe`;
}

export function buildMultiSomInstallPayload(
  slots: Array<{
    portalClienteId: number;
    portalPdvId: number;
    codigoDisplay: string;
    pdvNome: string;
  }>,
) {
  return {
    slotCount: slots.length,
    slots: slots.map((s, i) => ({
      index: i + 1,
      label: s.codigoDisplay,
      sinkId: "",
      sinkLabel: "",
      pdv: {
        clienteId: s.portalClienteId,
        pdvId: s.portalPdvId,
        mode: "temp",
        codigoDisplay: s.codigoDisplay,
        pdvNome: s.pdvNome,
      },
    })),
  };
}

export function encodeMultiSomInstallArg(
  payload: ReturnType<typeof buildMultiSomInstallPayload>,
): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export async function gerarInstalacaoMultiSom(
  portalClienteId: number,
  portalPdvIds: number[],
  criadaPor: string,
): Promise<MultiSomInstalacaoResult> {
  if (portalPdvIds.length < 2 || portalPdvIds.length > 4) {
    throw new Error("multisom_pdv_count");
  }
  const unique = new Set(portalPdvIds);
  if (unique.size !== portalPdvIds.length) {
    throw new Error("multisom_pdv_duplicado");
  }

  const resolved = [];
  for (const portalPdvId of portalPdvIds) {
    if (portalClienteIdFromPdvId(portalPdvId) !== portalClienteId) {
      throw new Error("multisom_pdv_cliente");
    }
    const ctx = await resolveInstalacaoPdv(portalClienteId, portalPdvId);
    if (!ctx) throw new Error("pdv_nao_encontrado");
    const gate = await loadInstalacaoGeracaoGate({
      rioPdvKey: ctx.rioPdvKey,
      portalPdvId: ctx.portalPdvId,
      playerInstaladoEm: ctx.playerInstaladoEm,
    });
    if (!gate.podeGerarLink && gate.errorCode) {
      const err = new Error(gate.errorCode);
      (err as Error & { detail?: string }).detail = `${ctx.codigoDisplay}: ${gate.motivo ?? gate.errorCode}`;
      throw err;
    }
    resolved.push(ctx);
  }

  const slotsWithSenha: MultiSomSlotResult[] = [];
  for (const ctx of resolved) {
    const senhaTemporaria = await gerarSenhaTemporaria(
      ctx.portalClienteId,
      ctx.portalPdvId,
      criadaPor,
    );
    slotsWithSenha.push({
      portalPdvId: ctx.portalPdvId,
      portalClienteId: ctx.portalClienteId,
      codigoDisplay: ctx.codigoDisplay,
      pdvNome: ctx.pdvNome,
      senhaTemporaria,
    });
  }

  const payload = buildMultiSomInstallPayload(slotsWithSenha);
  const installArg = encodeMultiSomInstallArg(payload);
  const exeUrl = buildMultiSomInstallerExeUrl();

  return {
    slotCount: slotsWithSenha.length,
    slots: slotsWithSenha,
    exeUrl,
    installArg,
    installCommand: `RadioIbiza-MultiSom-Setup.exe --install-multisom=${installArg}`,
  };
}

export function formatMultiSomSlotsSummary(slots: MultiSomSlotResult[]): string {
  return slots
    .map((s, i) => `Player ${i + 1}: PDV ${s.codigoDisplay} — senha ${s.senhaTemporaria}`)
    .join("\n");
}
