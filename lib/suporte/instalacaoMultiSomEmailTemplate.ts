import { COMPANY_NAME } from "@/lib/brand";
import type { MultiSomSlotResult } from "@/lib/suporte/instalacaoMultiSomService";

export function renderInstalacaoMultiSomEmailHtml(input: {
  clienteNome: string;
  exeUrl: string;
  installCommand: string;
  slots: MultiSomSlotResult[];
}): { html: string } {
  const slotRows = input.slots
    .map(
      (s, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;color:#e4e4e7;">Player ${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;font-family:monospace;color:#f9a8d4;">${s.codigoDisplay}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;font-family:monospace;font-weight:700;letter-spacing:0.15em;color:#f472b6;">${s.senhaTemporaria}</td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#09090b;color:#e4e4e7;font-family:system-ui,sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <h1 style="color:#f9a8d4;font-size:22px;">Instalação Player Multi Som</h1>
    <p>Cliente: <strong>${input.clienteNome}</strong></p>
    <p>Este PC terá <strong>${input.slots.length} players</strong>, cada um num PDV e placa USB diferentes.</p>
    <p style="margin-top:20px;"><a href="${input.exeUrl}" style="display:inline-block;background:linear-gradient(135deg,#db2777,#9333ea);color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Baixar instalador Multi Som (.exe)</a></p>
    <h2 style="font-size:16px;color:#f472b6;margin-top:28px;">PDVs e senhas temporárias</h2>
    <table style="width:100%;border-collapse:collapse;background:#18181b;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#27272a;">
          <th style="padding:8px 12px;text-align:left;color:#a1a1aa;">Player</th>
          <th style="padding:8px 12px;text-align:left;color:#a1a1aa;">ID PDV</th>
          <th style="padding:8px 12px;text-align:left;color:#a1a1aa;">Senha temp.</th>
        </tr>
      </thead>
      <tbody>${slotRows}</tbody>
    </table>
    <h2 style="font-size:16px;color:#f472b6;margin-top:28px;">Passo a passo</h2>
    <ol style="line-height:1.6;color:#d4d4d8;">
      <li>Baixe e instale o .exe Multi Som no Windows.</li>
      <li>Na primeira abertura, informe o <strong>ID do PDV</strong> e a <strong>senha temporária</strong> de cada player (tabela acima).</li>
      <li>Escolha a <strong>placa USB</strong> de cada player (uma placa diferente por janela).</li>
      <li>Aguarde o download da programação em cada janela.</li>
    </ol>
    <p style="font-size:12px;color:#71717a;margin-top:24px;">Equipe ${COMPANY_NAME}</p>
  </div>
</body>
</html>`;

  return { html };
}

export function buildInstalacaoMultiSomEmailText(input: {
  clienteNome: string;
  exeUrl: string;
  slots: MultiSomSlotResult[];
}): string {
  const linhas = input.slots.map(
    (s, i) => `${i + 1}. Player ${i + 1} — PDV ${s.codigoDisplay} — senha ${s.senhaTemporaria}`,
  );
  return [
    `Instalação Player Multi Som — ${COMPANY_NAME}`,
    ``,
    `Cliente: ${input.clienteNome}`,
    ``,
    `Instalador (.exe):`,
    input.exeUrl,
    ``,
    `PDVs e senhas temporárias (uso único):`,
    ...linhas,
    ``,
    `Passo a passo:`,
    `1. Instale o .exe Multi Som no Windows.`,
    `2. Informe ID do PDV e senha temporária de cada player.`,
    `3. Escolha a placa USB de cada player.`,
    ``,
    `Equipe ${COMPANY_NAME}`,
  ].join("\n");
}
