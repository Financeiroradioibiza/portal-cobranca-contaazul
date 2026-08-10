/** Template v3 (estilo escuro) — instalação Windows (tipos 1–4), sem Google Play/Android. */
import type { InstalacaoTipo } from "@/lib/suporte/instalacaoService";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function introForTipo(tipo: InstalacaoTipo): string {
  switch (tipo) {
    case "pdv_login":
      return "Olá! Segue o link para instalar o Player neste PDV no <b>Windows</b>. O ponto de venda já vem selecionado — use a senha padrão do cliente.";
    case "pdv_senha_temp":
      return "Olá! Segue o link e a <b>senha temporária</b> para instalar o Player neste PDV no <b>Windows</b> (uso único).";
    case "pdv_senha_temp_migracao":
      return "Olá! Segue o link para instalar o <b>Player 5</b> no Windows. Depois da instalação, siga o passo para remover o player antigo.";
    default:
      return "Olá! Segue o link para instalar o Player no <b>computador Windows</b>. Entre com e-mail e senha do cliente e escolha o PDV na lista.";
  }
}

function subtituloForTipo(tipo: InstalacaoTipo): string {
  switch (tipo) {
    case "pdv_login":
      return "Instalação do PDV com login";
    case "pdv_senha_temp":
      return "Instalação com senha temporária";
    case "pdv_senha_temp_migracao":
      return "Atualização Player 5 + remover antigo";
    default:
      return "Instalação padrão (cliente)";
  }
}

const DESKTOP_EMAIL_STYLES = `<style>
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
  .hero {
    position: relative;
    padding: 44px 24px 36px;
    background: #0c0c14;
    overflow: hidden;
    text-align: center;
  }
  .hero .glow {
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(circle at 28% 30%, rgba(255,122,69,0.38), transparent 45%),
      radial-gradient(circle at 72% 35%, rgba(168,120,255,0.28), transparent 45%),
      radial-gradient(circle at 50% 75%, rgba(255,77,141,0.32), transparent 50%);
    filter: blur(10px);
  }
  .hero-inner { position: relative; z-index: 1; }
  .logo {
    font-weight: 800;
    font-size: 22px;
    letter-spacing: -0.3px;
    margin-bottom: 10px;
  }
  .logo .r2 { background: linear-gradient(90deg,#ff7a45,#ff4d8d); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .logo .i { background: linear-gradient(90deg,#4dd0e1,#66d98c); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .hero h1 {
    font-weight: 700;
    font-size: 16px;
    line-height: 1.3;
    color: #ffffff;
    margin-bottom: 6px;
  }
  .hero p {
    font-size: 11px;
    color: #d8d8e6;
    font-weight: 500;
  }
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
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.28em;
    color: #ffb199;
    margin-bottom: 10px;
  }
  .code-hint {
    font-size: 11px;
    color: #8b8b9c;
  }
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
  .steps {
    list-style: none;
    counter-reset: step;
  }
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
</style>`;

function stepsHtml(steps: string[]): string {
  return steps
    .map((s) => `<li>${esc(s)}</li>`)
    .join("\n      ");
}

export function renderInstalacaoDesktopEmailHtml(input: {
  tipo: InstalacaoTipo;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  link: string;
  senhaTemporaria?: string;
  passos: string[];
}): string {
  const senhaBlock =
    input.senhaTemporaria?.trim()
      ? `<div class="code-box">
      <div class="code-label">SENHA TEMPORÁRIA · USO ÚNICO</div>
      <div class="code">${esc(input.senhaTemporaria.trim())}</div>
      <div class="code-hint">Copiar: clique ou toque na senha → <b>Ctrl+C</b> ou <b>Cmd+C</b> e cole no Player.</div>
    </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radio Ibiza — Instalação Windows</title>
${DESKTOP_EMAIL_STYLES}
</head>
<body>

<div class="email">

  <div class="hero">
    <div class="glow"></div>
    <div class="hero-inner">
      <div class="logo"><span class="r2">Radio</span> <span class="i">Ibiza</span></div>
      <h1>Bem-vindo à instalação</h1>
      <p>${esc(subtituloForTipo(input.tipo))} · Windows</p>
    </div>
  </div>

  <div class="divider-wrap"><div class="divider"></div></div>

  <div class="main">
    <div class="eyebrow-main">SUA RÁDIO NO COMPUTADOR</div>

    <p class="intro">${introForTipo(input.tipo)}</p>

    <div class="info-box">
      <b>Cliente:</b> ${esc(input.clienteNome)}<br>
      <b>Ponto de venda:</b> ${esc(input.pdvNome)} (${esc(input.codigoDisplay)})<br>
      <b>Plataforma:</b> Computador Windows
    </div>

    ${senhaBlock}

    <a class="cta-btn" href="${esc(input.link)}">Abrir instalação</a>
    <div class="cta-link">${esc(input.link)}</div>

    <div class="steps-title">Passo a passo</div>
    <ul class="steps">
      ${stepsHtml(input.passos)}
    </ul>
  </div>

  <div class="footer">
    Qualquer dúvida, é só responder este e-mail.
    <div class="fname"><span class="r">Radio</span> <span class="i">Ibiza</span></div>
  </div>

</div>

</body>
</html>`;
}
