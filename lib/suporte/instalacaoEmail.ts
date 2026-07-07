import { COMPANY_NAME } from "@/lib/brand";
import type { InstalacaoPlataforma, InstalacaoTipo } from "@/lib/suporte/instalacaoService";

export type InstalacaoEmailInput = {
  tipo: InstalacaoTipo;
  plataforma: InstalacaoPlataforma;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  link: string;
  /** Só para tipos pdv_senha_temp e pdv_senha_temp_migracao. */
  senhaTemporaria?: string;
};

export type InstalacaoEmailContent = {
  subject: string;
  text: string;
  html: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plataformaLabel(p: InstalacaoPlataforma): string {
  return p === "mobile" ? "Celular / Tablet" : "Computador Windows";
}

/** Passos de instalação por plataforma (texto simples). */
function passos(plataforma: InstalacaoPlataforma, tipo: InstalacaoTipo, senha?: string): string[] {
  const abrir =
    plataforma === "mobile"
      ? "Abra o link no navegador do celular (Chrome no Android ou Safari no iPhone)."
      : "Abra o link no navegador do computador (Google Chrome de preferência).";
  const instalar =
    plataforma === "mobile"
      ? "Siga o guia da página para adicionar o Player à tela inicial."
      : "Clique em «Instalar aplicativo» e siga o assistente do navegador.";

  const passos = [abrir, instalar];

  if (tipo === "pdv_login") {
    passos.push("Ao abrir o Player, entre com o e-mail e a senha do cliente. O ponto de venda já vem selecionado — não é preciso escolher na lista.");
  } else if (tipo === "pdv_senha_temp" || tipo === "pdv_senha_temp_migracao") {
    passos.push(
      `Ao abrir o Player, digite a senha temporária: ${senha ?? "(enviada abaixo)"}. Essa senha funciona apenas uma vez, nesta instalação.`,
    );
    if (tipo === "pdv_senha_temp_migracao" && plataforma === "windows") {
      passos.push(
        "Depois de baixar a programação e confirmar os dados da loja, siga o passo na tela para desinstalar o player antigo (ficheiro .bat na pasta Downloads).",
      );
    }
  } else {
    passos.push("Ao abrir o Player, entre com o e-mail e a senha do cliente e escolha o ponto de venda na lista.");
  }
  return passos;
}

export function buildInstalacaoEmail(input: InstalacaoEmailInput): InstalacaoEmailContent {
  const { tipo, plataforma, clienteNome, pdvNome, codigoDisplay, link, senhaTemporaria } = input;

  const subject = `${COMPANY_NAME} — Instalação do Player (${pdvNome})`;

  const linhas = passos(plataforma, tipo, senhaTemporaria);

  const textParts: string[] = [
    `Olá!`,
    ``,
    `Segue o link para instalar o Player da ${COMPANY_NAME}.`,
    ``,
    `Cliente: ${clienteNome}`,
    `Ponto de venda: ${pdvNome} (${codigoDisplay})`,
    `Plataforma: ${plataformaLabel(plataforma)}`,
    ``,
    `Link de instalação:`,
    link,
    ``,
  ];

  if ((tipo === "pdv_senha_temp" || tipo === "pdv_senha_temp_migracao") && senhaTemporaria) {
    textParts.push(`Senha temporária (uso único): ${senhaTemporaria}`, ``);
  }

  textParts.push(`Passo a passo:`);
  linhas.forEach((l, i) => textParts.push(`${i + 1}. ${l}`));
  textParts.push(``, `Qualquer dúvida, é só responder este e-mail.`, ``, `Equipe ${COMPANY_NAME}`);

  const text = textParts.join("\n");

  const senhaBlockHtml =
    tipo === "pdv_senha_temp" && senhaTemporaria
      ? `<tr><td style="padding:16px 0;">
           <div style="font-size:13px;color:#52525b;margin-bottom:6px;">Senha temporária (uso único)</div>
           <div style="font-family:monospace;font-size:26px;letter-spacing:4px;font-weight:700;color:#0f172a;background:#f1f5f9;border-radius:10px;padding:14px 18px;display:inline-block;">${esc(senhaTemporaria)}</div>
         </td></tr>`
      : "";

  const passosHtml = linhas
    .map(
      (l, i) =>
        `<li style="margin-bottom:8px;color:#334155;font-size:14px;line-height:1.5;">${esc(l)}</li>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;padding:22px 28px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;">${esc(COMPANY_NAME)}</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:2px;">Instalação do Player</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px;color:#0f172a;font-size:15px;">Olá! Segue o link para instalar o Player.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;">
            <tr><td style="padding:14px 16px;font-size:13px;color:#475569;">
              <div><strong style="color:#0f172a;">Cliente:</strong> ${esc(clienteNome)}</div>
              <div style="margin-top:4px;"><strong style="color:#0f172a;">Ponto de venda:</strong> ${esc(pdvNome)} <span style="color:#94a3b8;">(${esc(codigoDisplay)})</span></div>
              <div style="margin-top:4px;"><strong style="color:#0f172a;">Plataforma:</strong> ${esc(plataformaLabel(plataforma))}</div>
            </td></tr>
          </table>
          <div style="text-align:center;margin:26px 0;">
            <a href="${esc(link)}" style="background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:12px;display:inline-block;">Abrir instalação</a>
          </div>
          <div style="font-size:12px;color:#94a3b8;word-break:break-all;text-align:center;margin-bottom:8px;">${esc(link)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${senhaBlockHtml}</table>
          <h3 style="font-size:14px;color:#0f172a;margin:20px 0 8px;">Passo a passo</h3>
          <ol style="margin:0;padding-left:20px;">${passosHtml}</ol>
          <p style="margin:22px 0 0;color:#64748b;font-size:13px;">Qualquer dúvida, é só responder este e-mail.</p>
          <p style="margin:8px 0 0;color:#0f172a;font-size:13px;font-weight:600;">Equipe ${esc(COMPANY_NAME)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
