import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { COMPANY_NAME } from "@/lib/brand";
import { renderInstalacaoDesktopEmailHtml } from "@/lib/suporte/instalacaoDesktopEmailTemplate";
import { renderInstalacaoElectronEmailHtml } from "@/lib/suporte/instalacaoElectronEmailTemplate";
import { renderInstalacaoPlay5EmailHtml } from "@/lib/suporte/instalacaoPlay5EmailTemplate";
import {
  buildElectronInstallerExeUrl,
  buildElectronInstallerGuiaUrl,
  GOOGLE_PLAY_PLAYER5_URL,
  type ElectronAuthModo,
  type InstalacaoPlataforma,
  type InstalacaoTipo,
} from "@/lib/suporte/instalacaoService";
import { tipoUsaSenhaTemporaria } from "@/lib/suporte/instalacaoTipos";

export type InstalacaoEmailInput = {
  tipo: InstalacaoTipo;
  plataforma: InstalacaoPlataforma;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  link: string;
  senhaTemporaria?: string;
  codigoPlay?: string;
  /** Só tipo 6 (electron_ti). */
  electronAuth?: ElectronAuthModo;
  portalClienteId?: number;
  portalPdvId?: number;
};

export type InstalacaoEmailContent = {
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
};

function passosPlay(codigoPlay: string): string[] {
  return [
    "Abra o link da Google Play neste e-mail e instale o app «Rádio Ibiza Player» no celular Android.",
    "Ao abrir o app pela primeira vez, digite o código PL5 destacado acima (sem os hífens, se preferir).",
    `Código: ${codigoPlay} — funciona apenas uma vez, nesta instalação.`,
    "Aguarde o download da programação e confirme os dados da loja na tela do app.",
  ];
}

function passosWindows(tipo: InstalacaoTipo, senha?: string): string[] {
  const passosList = [
    "Abra o link neste e-mail no Google Chrome do computador Windows.",
    "Clique em «Instalar aplicativo» e siga o assistente do navegador.",
  ];

  if (tipo === "pdv_login") {
    passosList.push(
      "Ao abrir o Player, entre com o e-mail e a senha do cliente. O ponto de venda já vem selecionado — não é preciso escolher na lista.",
    );
  } else if (tipoUsaSenhaTemporaria(tipo)) {
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

function passosElectron(auth: ElectronAuthModo, senha?: string): string[] {
  const passosList = [
    "Baixe e execute o instalador .exe (link «Baixar instalador» neste e-mail). Aceite as permissões de administrador se o Windows pedir.",
    "Abra o Player instalado no menu Iniciar ou atalho «Radio Ibiza Player».",
  ];
  if (auth === "temp") {
    passosList.push(
      senha
        ? "Na tela de login, escolha a aba «Senha temporária» e digite o código destacado acima (uso único)."
        : "Na tela de login, escolha a aba «Senha temporária» e digite o código enviado neste e-mail.",
    );
  } else {
    passosList.push(
      "Na tela de login, use a aba «E-mail e senha» com as credenciais do cliente. O PDV deste link já vem associado a este computador.",
    );
  }
  passosList.push("Aguarde o download da programação e confirme os dados da loja.");
  return passosList;
}

function subjectForTipo(tipo: InstalacaoTipo, pdvNome: string): string {
  if (tipo === "pdv_play5") {
    return `${COMPANY_NAME} — Instalação do Player na Google Play (${pdvNome})`;
  }
  if (tipo === "electron_ti") {
    return `${COMPANY_NAME} — Instalação multisusuário Windows (${pdvNome})`;
  }
  if (tipo === "pdv_senha_temp_migracao") {
    return `${COMPANY_NAME} — Atualização Player 5 no Windows (${pdvNome})`;
  }
  return `${COMPANY_NAME} — Instalação do Player no Windows (${pdvNome})`;
}

export function buildInstalacaoEmail(input: InstalacaoEmailInput): InstalacaoEmailContent {
  const {
    tipo,
    clienteNome,
    pdvNome,
    codigoDisplay,
    link,
    senhaTemporaria,
    codigoPlay,
    electronAuth = "temp",
    portalClienteId,
    portalPdvId,
  } = input;

  const isPlay5 = tipo === "pdv_play5";
  const isElectron = tipo === "electron_ti";
  const playUrl = GOOGLE_PLAY_PLAYER5_URL;
  const subject = subjectForTipo(tipo, pdvNome);

  const exeUrl = buildElectronInstallerExeUrl();
  const guiaUrl =
    isElectron && portalClienteId != null && portalPdvId != null
      ? buildElectronInstallerGuiaUrl({ portalClienteId, portalPdvId }, electronAuth)
      : link;

  const linhas = isPlay5 && codigoPlay
    ? passosPlay(codigoPlay)
    : isElectron
      ? passosElectron(electronAuth, senhaTemporaria)
      : passosWindows(tipo, senhaTemporaria);

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
  } else if (isElectron) {
    textParts.push(
      `Segue o instalador multisusuário Windows (.exe) da ${COMPANY_NAME} para este PDV.`,
      ``,
      `Cliente: ${clienteNome}`,
      `Ponto de venda: ${pdvNome} (${codigoDisplay})`,
      `Modo: ${electronAuth === "temp" ? "Senha temporária" : "Login e senha do cliente"}`,
      ``,
      `Instalador (.exe):`,
      exeUrl,
      ``,
      `Guia de instalação:`,
      guiaUrl,
      ``,
    );
    if (electronAuth === "temp" && senhaTemporaria) {
      textParts.push(
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Senha temporária (copie aqui):`,
        senhaTemporaria,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
      );
    }
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
    if (tipoUsaSenhaTemporaria(tipo) && senhaTemporaria) {
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

  const html = play5Rendered?.html
    ?? (isElectron
      ? renderInstalacaoElectronEmailHtml({
          clienteNome,
          pdvNome,
          codigoDisplay,
          guiaUrl,
          exeUrl,
          electronAuth,
          senhaTemporaria,
          passos: linhas,
        })
      : renderInstalacaoDesktopEmailHtml({
          tipo,
          clienteNome,
          pdvNome,
          codigoDisplay,
          link,
          senhaTemporaria,
          passos: linhas,
        }));

  return { subject, text, html, attachments: play5Rendered?.attachments };
}
