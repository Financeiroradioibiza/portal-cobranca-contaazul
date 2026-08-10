import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { COMPANY_NAME } from "@/lib/brand";
import { renderInstalacaoDesktopEmailHtml } from "@/lib/suporte/instalacaoDesktopEmailTemplate";
import { renderInstalacaoPlay5EmailHtml } from "@/lib/suporte/instalacaoPlay5EmailTemplate";
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
  attachments?: EmailAttachment[];
};

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

/** Passos de instalação Windows (tipos 1–4). Mobile/PWA: use tipo 5 Google Play. */
function passosWindows(tipo: InstalacaoTipo, senha?: string): string[] {
  const passosList = [
    "Abra o link neste e-mail no Google Chrome do computador Windows.",
    "Clique em «Instalar aplicativo» e siga o assistente do navegador.",
  ];

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
    if (tipo === "pdv_senha_temp_migracao") {
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

function subjectForTipo(tipo: InstalacaoTipo, pdvNome: string): string {
  if (tipo === "pdv_play5") {
    return `${COMPANY_NAME} — Instalação do Player na Google Play (${pdvNome})`;
  }
  if (tipo === "pdv_senha_temp_migracao") {
    return `${COMPANY_NAME} — Atualização Player 5 no Windows (${pdvNome})`;
  }
  return `${COMPANY_NAME} — Instalação do Player no Windows (${pdvNome})`;
}

export function buildInstalacaoEmail(input: InstalacaoEmailInput): InstalacaoEmailContent {
  const { tipo, clienteNome, pdvNome, codigoDisplay, link, senhaTemporaria, codigoPlay } = input;

  const isPlay5 = tipo === "pdv_play5";
  const playUrl = GOOGLE_PLAY_PLAYER5_URL;
  const subject = subjectForTipo(tipo, pdvNome);

  const linhas =
    isPlay5 && codigoPlay ? passosPlay(codigoPlay) : passosWindows(tipo, senhaTemporaria);

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
      `Segue o link para instalar o Player da ${COMPANY_NAME} no computador Windows.`,
      ``,
      `Cliente: ${clienteNome}`,
      `Ponto de venda: ${pdvNome} (${codigoDisplay})`,
      `Plataforma: Computador Windows`,
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

  const play5Rendered =
    isPlay5 && codigoPlay
      ? renderInstalacaoPlay5EmailHtml({
          clienteNome,
          pdvNome,
          codigoDisplay,
          codigoPlay,
          playUrl,
        })
      : null;

  const html =
    play5Rendered?.html ??
    renderInstalacaoDesktopEmailHtml({
      tipo,
      clienteNome,
      pdvNome,
      codigoDisplay,
      link,
      senhaTemporaria,
      passos: linhas,
    });

  return { subject, text, html, attachments: play5Rendered?.attachments };
}
