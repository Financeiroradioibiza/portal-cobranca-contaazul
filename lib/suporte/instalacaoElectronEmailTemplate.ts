/** Template v3 — instalação Electron multisusuário Windows (tipo 6, TI). */
import type { ElectronAuthModo } from "@/lib/suporte/instalacaoService";

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
  guiaUrl: string;
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

function stepsHtml(steps: string[]): string {
  return steps.map((s) => `<li>${esc(s)}</li>`).join("\n      ");
}

export function renderInstalacaoElectronEmailHtml(input: InstalacaoElectronEmailInput): string {
  const authLabel = input.electronAuth === "temp" ? "Senha temporária" : "Login e senha do cliente";

  const senhaBlock =
    input.electronAuth === "temp" && input.senhaTemporaria?.trim()
      ? `<div class="code-box">
      <div class="code-label">SENHA TEMPORÁRIA · USO ÚNICO</div>
      <div class="code">${esc(input.senhaTemporaria.trim())}</div>
      <div class="code-hint">No Player, escolha a aba <b>Senha temporária</b> e cole este código.</div>
    </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radio Ibiza — Instalação Electron TI</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #05050a; font-family: 'Segoe UI', Roboto, Arial, sans-serif; display: flex; justify-content: center; padding: 40px 16px; }
  .email { width: 100%; max-width: 460px; background: #12121a; border-radius: 24px; overflow: hidden; border: 1px solid #23232f; }
  .hero { position: relative; padding: 44px 24px 36px; background: #0c0c14; text-align: center; }
  .hero .glow { position: absolute; inset: 0; background: radial-gradient(circle at 28% 30%, rgba(255,122,69,0.38), transparent 45%), radial-gradient(circle at 72% 35%, rgba(168,120,255,0.28), transparent 45%); filter: blur(10px); }
  .hero-inner { position: relative; z-index: 1; }
  .logo { font-weight: 800; font-size: 22px; margin-bottom: 10px; }
  .logo .r2 { background: linear-gradient(90deg,#ff7a45,#ff4d8d); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .logo .i { background: linear-gradient(90deg,#4dd0e1,#66d98c); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .hero h1 { font-size: 16px; color: #fff; margin-bottom: 6px; }
  .hero p { font-size: 11px; color: #d8d8e6; }
  .main { padding: 26px 28px 30px; }
  .intro { font-size: 14px; color: #d4d4e0; margin-bottom: 16px; line-height: 1.5; }
  .intro b { color: #fff; }
  .info-box { background: #191922; border: 1px solid #26262f; border-radius: 12px; padding: 14px 16px; font-size: 13px; color: #b8b8c8; line-height: 1.9; margin-bottom: 18px; }
  .info-box b { color: #e8e8f0; }
  .code-box { border: 1.5px solid #ff4d8d; border-radius: 14px; padding: 18px; text-align: center; margin-bottom: 20px; background: rgba(255,77,141,0.04); }
  .code-label { font-size: 10.5px; letter-spacing: 1.5px; color: #ff6f9c; font-weight: 700; margin-bottom: 10px; }
  .code { font-size: 24px; font-weight: 700; letter-spacing: 0.28em; color: #ffb199; margin-bottom: 10px; }
  .code-hint { font-size: 11px; color: #8b8b9c; }
  .cta-btn { display: block; text-align: center; background: linear-gradient(135deg, #a855f7, #7c3aed); color: #fff; font-weight: 700; font-size: 15px; padding: 14px; border-radius: 12px; text-decoration: none; margin-bottom: 8px; }
  .cta-link { text-align: center; font-size: 10.5px; color: #6b6b7c; word-break: break-all; margin-bottom: 14px; }
  .steps-title { font-size: 13px; font-weight: 700; color: #f0f0f4; margin-bottom: 10px; }
  .steps { list-style: none; counter-reset: step; }
  .steps li { counter-increment: step; font-size: 13px; color: #c0c0d0; line-height: 1.5; padding-left: 26px; position: relative; margin-bottom: 10px; }
  .steps li::before { content: counter(step); position: absolute; left: 0; width: 18px; height: 18px; border-radius: 50%; background: #23232f; color: #ff6f9c; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .footer { text-align: center; padding: 20px 28px 26px; font-size: 12px; color: #6b6b7c; }
</style>
</head>
<body>
<div class="email">
  <div class="hero">
    <div class="glow"></div>
    <div class="hero-inner">
      <div class="logo"><span class="r2">Radio</span> <span class="i">Ibiza</span></div>
      <h1>Instalação multisusuário Windows</h1>
      <p>PDV ${esc(input.codigoDisplay)} · ${esc(authLabel)}</p>
    </div>
  </div>
  <div class="main">
    <p class="intro">${introForAuth(input.electronAuth)}</p>
    <div class="info-box">
      <b>Cliente:</b> ${esc(input.clienteNome)}<br>
      <b>Ponto de venda:</b> ${esc(input.pdvNome)} (${esc(input.codigoDisplay)})<br>
      <b>Modo:</b> Instalador .exe (Electron TI)
    </div>
    ${senhaBlock}
    <a class="cta-btn" href="${esc(input.exeUrl)}">Baixar instalador (.exe)</a>
    <div class="cta-link">${esc(input.exeUrl)}</div>
    <a class="cta-btn" href="${esc(input.guiaUrl)}" style="background: linear-gradient(135deg, #6366f1, #4f46e5); margin-top: 4px;">Abrir guia de instalação</a>
    <div class="cta-link">${esc(input.guiaUrl)}</div>
    <div class="steps-title">Passo a passo</div>
    <ul class="steps">${stepsHtml(input.passos)}</ul>
  </div>
  <div class="footer">Qualquer dúvida, é só responder este e-mail.</div>
</div>
</body>
</html>`;
}
