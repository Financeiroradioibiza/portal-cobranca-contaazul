import { COMPANY_NAME, portalPublicAsset } from "@/lib/brand";
import { GOOGLE_PLAY_PLAYER5_URL } from "@/lib/suporte/instalacaoService";
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
  /** Só para pdv_play5 (Google Play Android). */
  codigoPlay?: string;
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

function usaSenhaTemporaria(tipo: InstalacaoTipo): boolean {
  return tipo === "pdv_senha_temp" || tipo === "pdv_senha_temp_migracao";
}

function passosPlay(codigoPlay: string): string[] {
  return [
    "Abra o link da Google Play neste e-mail e instale o app «Rádio Ibiza Player» no celular Android.",
    "Ao abrir o app pela primeira vez, digite o código PL5 destacado acima (sem os hífens, se preferir).",
    `Código: ${codigoPlay} — funciona apenas uma vez, nesta instalação.`,
    "Aguarde o download da programação e confirme os dados da loja na tela do app.",
  ];
}

/** Passos de instalação por plataforma (texto simples). */
function passos(plataforma: InstalacaoPlataforma, tipo: InstalacaoTipo, senha?: string): string[] {
  if (tipo === "pdv_play5") {
    return passosPlay("");
  }

  const abrir =
    plataforma === "mobile"
      ? "Abra o link no navegador do celular (Chrome no Android ou Safari no iPhone)."
      : "Abra o link no navegador do computador (Google Chrome de preferência).";
  const instalar =
    plataforma === "mobile"
      ? "Siga o guia da página para adicionar o Player à tela inicial."
      : "Clique em «Instalar aplicativo» e siga o assistente do navegador.";

  const passosList = [abrir, instalar];

  if (tipo === "pdv_login") {
    passosList.push(
      "Ao abrir o Player, entre com o e-mail e a senha do cliente. O ponto de venda já vem selecionado — não é preciso escolher na lista.",
    );
  } else if (usaSenhaTemporaria(tipo)) {
    passosList.push(
      senha
        ? "Na tela do Player, digite a senha temporária destacada acima neste e-mail. Ela funciona apenas uma vez, nesta instalação."
        : "Na tela do Player, digite a senha temporária enviada neste e-mail (uso único).",
    );
    if (tipo === "pdv_senha_temp_migracao" && plataforma === "windows") {
      passosList.push(
        "Depois de baixar a programação e confirmar os dados da loja, siga o passo na tela para desinstalar o player antigo (ficheiro .bat na pasta Downloads).",
      );
    }
  } else {
    passosList.push(
      "Ao abrir o Player, entre com o e-mail e a senha do cliente e escolha o ponto de venda na lista.",
    );
  }
  return passosList;
}

function codigoPlayBlockHtml(codigoPlay: string): string {
  return `<tr><td style="padding:8px 0 20px;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #ff4d8d;border-radius:14px;background:linear-gradient(180deg,#1a1020 0%,#120d18 100%);">
             <tr><td style="padding:18px 20px;text-align:center;">
               <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ff7eb3;margin-bottom:10px;">Código Google Play · uso único</div>
               <div style="font-family:Consolas,Monaco,'Courier New',monospace;font-size:34px;letter-spacing:0.2em;font-weight:800;color:#ffb84d;background:#0d0d14;border:1px solid #ff4d8d55;border-radius:10px;padding:16px 22px;display:inline-block;-webkit-user-select:all;user-select:all;cursor:text;">${esc(codigoPlay)}</div>
               <div style="margin-top:12px;font-size:12px;line-height:1.55;color:#a1a1aa;max-width:420px;margin-left:auto;margin-right:auto;">
                 <strong style="color:#e4e4e7;">Copiar:</strong> clique ou toque no código → <strong style="color:#e4e4e7;">Ctrl+C</strong> ou <strong style="color:#e4e4e7;">Cmd+C</strong> e cole no app.
               </div>
             </td></tr>
           </table>
         </td></tr>`;
}

/** Wordmark «Radio Ibiza» com cores do Player (gradiente aproximado para e-mail). */
function logoWordmarkHtml(sizePx = 34): string {
  return `<div style="font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:${sizePx}px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;">
    <span style="color:#ff4d8d;">Radio</span><span style="color:#ffb84d;"> Ibiza</span>
  </div>`;
}

/** Hero teaser — logo, boas-vindas e screenshot do Player. */
function play5HeroHtml(): string {
  const heroImg = portalPublicAsset("/email/instalacao-play5-hero.png");
  return `<tr><td style="padding:0;background-color:#0d0d14;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:36px 28px 20px;text-align:center;background:linear-gradient(180deg,#0d0d14 0%,#12121c 100%);">
        ${logoWordmarkHtml(38)}
        <div style="margin-top:20px;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:28px;font-weight:700;color:#ffffff;line-height:1.2;">Bem-vindo à Radio Ibiza</div>
        <div style="margin-top:12px;font-size:15px;line-height:1.6;color:#a1a1aa;max-width:420px;margin-left:auto;margin-right:auto;">
          Instale o Player no Android e leve a programação exclusiva da sua loja — onde o som faz a diferença.
        </div>
      </td></tr>
      <tr><td style="padding:0 0 8px;text-align:center;background:linear-gradient(180deg,#12121c 0%,#0d0d14 100%);">
        <img src="${esc(heroImg)}" width="560" alt="Player Radio Ibiza" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:0 24px 28px;text-align:center;background:#0d0d14;">
        <div style="height:3px;width:64px;margin:0 auto 16px;border-radius:999px;background:linear-gradient(90deg,#ff4d8d,#ffb84d,#4dd0ff);"></div>
        <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#ff7eb3;">Sua rádio, na palma da mão</div>
      </td></tr>
    </table>
  </td></tr>`;
}

function buildPlay5EmailHtml(input: {
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  codigoPlay: string;
  playUrl: string;
  linhas: string[];
}): string {
  const { clienteNome, pdvNome, codigoDisplay, codigoPlay, playUrl, linhas } = input;
  const passosHtml = linhas
    .map(
      (l, i) =>
        `<li style="margin-bottom:8px;color:#cbd5e1;font-size:14px;line-height:1.5;">${esc(l)}</li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:#0a0a0f;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#12121c;border-radius:20px;overflow:hidden;border:1px solid #27272a;box-shadow:0 24px 48px rgba(0,0,0,0.45);">
        ${play5HeroHtml()}
        <tr><td style="padding:28px 28px 32px;background:#12121c;">
          <p style="margin:0 0 18px;color:#e4e4e7;font-size:15px;line-height:1.55;">Olá! Segue tudo para instalar o Player pela <strong style="color:#ffb84d;">Google Play</strong> no Android.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #3f3f46;border-radius:12px;background:#18181b;">
            <tr><td style="padding:14px 16px;font-size:13px;color:#a1a1aa;">
              <div><strong style="color:#fafafa;">Cliente:</strong> ${esc(clienteNome)}</div>
              <div style="margin-top:4px;"><strong style="color:#fafafa;">Ponto de venda:</strong> ${esc(pdvNome)} <span style="color:#71717a;">(${esc(codigoDisplay)})</span></div>
              <div style="margin-top:4px;"><strong style="color:#fafafa;">Plataforma:</strong> Android (Google Play)</div>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${codigoPlayBlockHtml(codigoPlay)}</table>
          <div style="text-align:center;margin:26px 0;">
            <a href="${esc(playUrl)}" style="background:linear-gradient(135deg,#34a853 0%,#2d9248 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:14px;display:inline-block;box-shadow:0 8px 24px rgba(52,168,83,0.35);">Abrir na Google Play</a>
          </div>
          <div style="font-size:11px;color:#71717a;word-break:break-all;text-align:center;margin-bottom:12px;">${esc(playUrl)}</div>
          <h3 style="font-size:14px;color:#fafafa;margin:20px 0 10px;font-weight:600;">Passo a passo</h3>
          <ol style="margin:0;padding-left:20px;">${passosHtml}</ol>
          <p style="margin:24px 0 0;color:#71717a;font-size:13px;line-height:1.5;">Qualquer dúvida, é só responder este e-mail.</p>
          <p style="margin:10px 0 0;font-size:13px;font-weight:600;">${logoWordmarkHtml(18)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildInstalacaoEmail(input: InstalacaoEmailInput): InstalacaoEmailContent {
  const { tipo, plataforma, clienteNome, pdvNome, codigoDisplay, link, senhaTemporaria, codigoPlay } =
    input;

  const isPlay5 = tipo === "pdv_play5";
  const playUrl = GOOGLE_PLAY_PLAYER5_URL;

  const subject = isPlay5
    ? `${COMPANY_NAME} — Instalação do Player na Google Play (${pdvNome})`
    : `${COMPANY_NAME} — Instalação do Player (${pdvNome})`;

  const linhas = isPlay5 && codigoPlay ? passosPlay(codigoPlay) : passos(plataforma, tipo, senhaTemporaria);

  const textParts: string[] = [`Olá!`, ``];

  if (isPlay5) {
    textParts.push(
      `Segue o código e o link para instalar o Player da ${COMPANY_NAME} pela Google Play (Android).`,
      ``,
      `Cliente: ${clienteNome}`,
      `Ponto de venda: ${pdvNome} (${codigoDisplay})`,
      `Plataforma: Android (Google Play)`,
      ``,
    );
    if (codigoPlay) {
      textParts.push(
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Código Google Play (copie aqui):`,
        codigoPlay,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
      );
    }
    textParts.push(`Link da Google Play:`, playUrl, ``);
  } else {
    textParts.push(
      `Segue o link para instalar o Player da ${COMPANY_NAME}.`,
      ``,
      `Cliente: ${clienteNome}`,
      `Ponto de venda: ${pdvNome} (${codigoDisplay})`,
      `Plataforma: ${plataformaLabel(plataforma)}`,
      ``,
      `Link de instalação:`,
      link,
      ``,
    );
    if (usaSenhaTemporaria(tipo) && senhaTemporaria) {
      textParts.push(
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Senha temporária (copie aqui):`,
        senhaTemporaria,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
      );
    }
  }

  textParts.push(`Passo a passo:`);
  linhas.forEach((l, i) => textParts.push(`${i + 1}. ${l}`));
  textParts.push(``, `Qualquer dúvida, é só responder este e-mail.`, ``, `Equipe ${COMPANY_NAME}`);

  const text = textParts.join("\n");

  const senhaBlockHtml =
    !isPlay5 && usaSenhaTemporaria(tipo) && senhaTemporaria
      ? `<tr><td style="padding:8px 0 20px;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #d946ef;border-radius:14px;background:linear-gradient(180deg,#fdf4ff 0%,#faf5ff 100%);">
             <tr><td style="padding:18px 20px;text-align:center;">
               <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#a21caf;margin-bottom:10px;">Senha temporária · uso único</div>
               <div style="font-family:Consolas,Monaco,'Courier New',monospace;font-size:34px;letter-spacing:0.28em;font-weight:800;color:#701a75;background:#ffffff;border:1px solid #f0abfc;border-radius:10px;padding:16px 22px;display:inline-block;-webkit-user-select:all;user-select:all;cursor:text;">${esc(senhaTemporaria)}</div>
               <div style="margin-top:12px;font-size:12px;line-height:1.55;color:#6b7280;max-width:420px;margin-left:auto;margin-right:auto;">
                 <strong style="color:#374151;">Copiar:</strong> clique ou toque na senha para selecionar tudo → depois <strong style="color:#374151;">Ctrl+C</strong> (Windows) ou <strong style="color:#374151;">Cmd+C</strong> (Mac) e cole no Player.
               </div>
             </td></tr>
           </table>
         </td></tr>`
      : "";

  const playCodigoBlockHtml = isPlay5 && codigoPlay ? codigoPlayBlockHtml(codigoPlay) : "";

  const passosHtml = linhas
    .map(
      (l, i) =>
        `<li style="margin-bottom:8px;color:#334155;font-size:14px;line-height:1.5;">${esc(l)}</li>`,
    )
    .join("");

  const plataformaInfo = isPlay5 ? "Android (Google Play)" : plataformaLabel(plataforma);

  const ctaHtml = isPlay5
    ? `<div style="text-align:center;margin:26px 0;">
            <a href="${esc(playUrl)}" style="background:#34a853;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:12px;display:inline-block;">Abrir na Google Play</a>
          </div>
          <div style="font-size:12px;color:#94a3b8;word-break:break-all;text-align:center;margin-bottom:8px;">${esc(playUrl)}</div>`
    : `<div style="text-align:center;margin:26px 0;">
            <a href="${esc(link)}" style="background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:12px;display:inline-block;">Abrir instalação</a>
          </div>
          <div style="font-size:12px;color:#94a3b8;word-break:break-all;text-align:center;margin-bottom:8px;">${esc(link)}</div>`;

  const introHtml = isPlay5
    ? `<p style="margin:0 0 16px;color:#0f172a;font-size:15px;">Olá! Segue o código e o link para instalar o Player pela Google Play no Android.</p>`
    : `<p style="margin:0 0 16px;color:#0f172a;font-size:15px;">Olá! Segue o link para instalar o Player.</p>`;

  const html =
    isPlay5 && codigoPlay
      ? buildPlay5EmailHtml({
          clienteNome,
          pdvNome,
          codigoDisplay,
          codigoPlay,
          playUrl,
          linhas,
        })
      : `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;padding:22px 28px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;">${esc(COMPANY_NAME)}</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:2px;">${isPlay5 ? "Instalação Google Play (Android)" : "Instalação do Player"}</div>
        </td></tr>
        <tr><td style="padding:28px;">
          ${introHtml}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;">
            <tr><td style="padding:14px 16px;font-size:13px;color:#475569;">
              <div><strong style="color:#0f172a;">Cliente:</strong> ${esc(clienteNome)}</div>
              <div style="margin-top:4px;"><strong style="color:#0f172a;">Ponto de venda:</strong> ${esc(pdvNome)} <span style="color:#94a3b8;">(${esc(codigoDisplay)})</span></div>
              <div style="margin-top:4px;"><strong style="color:#0f172a;">Plataforma:</strong> ${esc(plataformaInfo)}</div>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${playCodigoBlockHtml}${senhaBlockHtml}</table>
          ${ctaHtml}
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
