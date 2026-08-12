/** Template v4 — instalação Electron multisusuário Windows (tipo 6, TI). */
import type { EmailAttachment } from "@/lib/email/ocSmtp";
import type { ElectronAuthModo } from "@/lib/suporte/instalacaoService";
import { INSTALACAO_PLAY5_HERO_B64 } from "@/lib/suporte/instalacaoPlay5HeroBannerBase64";

/** Mesmo hero do e-mail Google Play (capturas reais do Player 5). */
const ELECTRON_HERO_CID = "play5-hero-banner";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InstalacaoElectronEmailInput = {
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  exeUrl: string;
  electronAuth: ElectronAuthModo;
  senhaTemporaria?: string;
  passos: string[];
};

function introForAuth(auth: ElectronAuthModo): string {
  if (auth === "temp") {
    return "Olá! Segue o instalador <b>multisusuário Windows</b> (.exe) e a <b>senha temporária</b> para este PDV (uso único).";
  }
  return "Olá! Segue o instalador <b>multisusuário Windows</b> (.exe) para este PDV. Use o e-mail e a senha do cliente no Player.";
}

function authSubtitulo(auth: ElectronAuthModo): string {
  return auth === "temp" ? "Senha temporária · uso único" : "Login e senha do cliente";
}

function stepsHtml(steps: string[]): string {
  return steps.map((s) => `<li>${esc(s)}</li>`).join("\n      ");
}

export function renderInstalacaoElectronEmailHtml(
  input: InstalacaoElectronEmailInput,
): { html: string; attachments: EmailAttachment[] } {
  const senhaBlock =
    input.electronAuth === "temp" && input.senhaTemporaria?.trim()
      ? `<div class="code-box">
      <div class="code-label">SENHA TEMPORÁRIA · USO ÚNICO</div>
      <div class="code">${esc(input.senhaTemporaria.trim())}</div>
      <div class="code-hint">No Player, escolha a aba <b>Senha temporária</b> e cole este código.</div>
    </div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radio Ibiza — Instalação Windows multisusuário</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #05050a;
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    display: flex;
    justify-content: center;
    padding: 40px 16px;
  }
  .email {
    width: 100%;
    max-width: 460px;
    background: #12121a;
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid #23232f;
  }
  .hero-banner { background: #0c0c14; line-height: 0; }
  .divider-wrap { padding: 0 28px; }
  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, #ff4d8d, #a878ff, transparent);
    opacity: 0.5;
  }
  .main { padding: 26px 28px 30px; }
  .eyebrow-main {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #ff6f9c;
    margin-bottom: 14px;
  }
  .main p.intro {
    font-size: 14px;
    color: #d4d4e0;
    margin-bottom: 16px;
    line-height: 1.5;
  }
  .main p.intro b { color: #fff; }
  .info-box {
    background: #191922;
    border: 1px solid #26262f;
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 13px;
    color: #b8b8c8;
    line-height: 1.9;
    margin-bottom: 18px;
  }
  .info-box b { color: #e8e8f0; }
  .code-box {
    border: 1.5px solid #ff4d8d;
    border-radius: 14px;
    padding: 18px;
    text-align: center;
    margin-bottom: 20px;
    background: rgba(255,77,141,0.04);
  }
  .code-label {
    font-size: 10.5px;
    letter-spacing: 1.5px;
    color: #ff6f9c;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .code {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.28em;
    color: #ffb199;
    margin-bottom: 10px;
  }
  .code-hint { font-size: 11px; color: #8b8b9c; }
  .code-hint b { color: #cfcfe0; }
  .cta-btn {
    display: block;
    text-align: center;
    background: linear-gradient(135deg, #a855f7, #7c3aed);
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    padding: 14px;
    border-radius: 12px;
    text-decoration: none;
    margin-bottom: 8px;
    box-shadow: 0 6px 18px rgba(124,58,237,0.35);
  }
  .cta-link {
    text-align: center;
    font-size: 10.5px;
    color: #6b6b7c;
    word-break: break-all;
    margin-bottom: 22px;
  }
  .steps-title {
    font-size: 13px;
    font-weight: 700;
    color: #f0f0f4;
    margin-bottom: 10px;
  }
  .steps { list-style: none; counter-reset: step; }
  .steps li {
    counter-increment: step;
    font-size: 13px;
    color: #c0c0d0;
    line-height: 1.5;
    padding-left: 26px;
    position: relative;
    margin-bottom: 10px;
  }
  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #23232f;
    color: #ff6f9c;
    font-size: 10.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .footer {
    text-align: center;
    padding: 20px 28px 26px;
    font-size: 12px;
    color: #6b6b7c;
  }
  .footer .fname {
    font-weight: 700;
    margin-top: 8px;
    font-size: 14px;
  }
  .footer .fname .r { color: #ff7a45; }
  .footer .fname .i { color: #66d98c; }
</style>
</head>
<body>

<div class="email">

  <div class="hero-banner">
    <img src="cid:${ELECTRON_HERO_CID}" alt="Bem-vindo à Radio Ibiza" width="460" style="display:block;width:100%;max-width:460px;height:auto;border:0;" />
  </div>

  <div class="divider-wrap"><div class="divider"></div></div>

  <div class="main">
    <div class="eyebrow-main">SUA RÁDIO NO COMPUTADOR</div>

    <p class="intro">${introForAuth(input.electronAuth)}</p>

    <div class="info-box">
      <b>Cliente:</b> ${esc(input.clienteNome)}<br>
      <b>Ponto de venda:</b> ${esc(input.pdvNome)} (${esc(input.codigoDisplay)})<br>
      <b>Plataforma:</b> Windows multisusuário (.exe)<br>
      <b>Acesso:</b> ${esc(authSubtitulo(input.electronAuth))}
    </div>

    ${senhaBlock}

    <a class="cta-btn" href="${esc(input.exeUrl)}">Baixar instalador (.exe)</a>
    <div class="cta-link">${esc(input.exeUrl)}</div>

    <div class="steps-title">Passo a passo</div>
    <ul class="steps">${stepsHtml(input.passos)}</ul>
  </div>

  <div class="footer">
    Qualquer dúvida, é só responder este e-mail.
    <div class="fname"><span class="r">Radio</span> <span class="i">Ibiza</span></div>
  </div>

</div>

</body>
</html>`;

  return {
    html,
    attachments: [
      {
        filename: "instalacao-play5-hero-banner.png",
        content: Buffer.from(INSTALACAO_PLAY5_HERO_B64, "base64"),
        contentType: "image/png",
        cid: ELECTRON_HERO_CID,
      },
    ],
  };
}
