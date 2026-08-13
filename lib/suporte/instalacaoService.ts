import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { listPortalPlayerRows } from "@/lib/player/listPortalPlayerRows";
import { ensurePdvInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";
import { pdvLivreParaCodigoPlay } from "@/lib/suporte/instalacaoPlayService";
import { formatPortalPdvIdDisplay, portalClienteIdFromPdvId } from "@/lib/player/portalPlayerIds";

export type InstalacaoTipo =
  | "padrao_cliente"
  | "pdv_login"
  | "pdv_senha_temp"
  | "pdv_senha_temp_migracao"
  | "pdv_play5"
  | "electron_ti";
export type InstalacaoPlataforma = "windows" | "mobile";
export type InstalacaoCanal = "email" | "link";
export type ElectronAuthModo = "login" | "temp";

/** App Android na Google Play (TWA Player 5). */
export const GOOGLE_PLAY_PLAYER5_URL =
  "https://play.google.com/store/apps/details?id=br.com.radioibiza.player5.twa&pcampaignid=web_share";

/** Origem pública do Player 5 — base de todos os links de instalação. */
export function player5Origin(): string {
  const raw = process.env.PLAYER5_PUBLIC_ORIGIN?.trim();
  return (raw && raw.length > 0 ? raw : "https://player5.radioibiza.app.br").replace(/\/$/, "");
}

export type InstalacaoPdvContext = {
  portalClienteId: number;
  portalPdvId: number;
  codigoDisplay: string;
  clienteNome: string;
  pdvNome: string;
  rioPdvKey: string;
  instalacaoToken: string;
  contatoLojaNome: string;
  contatoLojaEmail: string;
  contatoLojaTelefone: string;
  playerInstaladoEm: string | null;
  podeGerarCodigoPlay: boolean;
};

/** Resolve um par cliente/PDV do Player em contexto completo (nomes, token, contato loja). */
export async function resolveInstalacaoPdv(
  portalClienteId: number,
  portalPdvId: number,
): Promise<InstalacaoPdvContext | null> {
  const { rows } = await listPortalPlayerRows();
  const row = rows.find(
    (r) => r.portalPlayerId && r.portalPlayerId.portalPdvId === portalPdvId,
  );
  if (!row || !row.portalPlayerId) return null;
  if (row.portalPlayerId.portalClienteId !== portalClienteId) return null;

  const rioPdvKey = row.rioPdvId;
  const instalacaoToken = await ensurePdvInstalacaoToken(rioPdvKey);

  const cadastro = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey },
    select: {
      contatoLojaNome: true,
      contatoLojaEmail: true,
      contatoLojaTelefone: true,
      playerInstaladoEm: true,
    },
  });

  const podeGerarCodigoPlay = await pdvLivreParaCodigoPlay(rioPdvKey);

  return {
    portalClienteId,
    portalPdvId,
    codigoDisplay: formatPortalPdvIdDisplay(portalPdvId),
    clienteNome: row.clienteNome.trim() || "Cliente",
    pdvNome: row.rioPdvNome.trim() || formatPortalPdvIdDisplay(portalPdvId),
    rioPdvKey,
    instalacaoToken,
    contatoLojaNome: cadastro?.contatoLojaNome?.trim() ?? "",
    contatoLojaEmail: cadastro?.contatoLojaEmail?.trim() ?? "",
    contatoLojaTelefone: cadastro?.contatoLojaTelefone?.trim() ?? "",
    playerInstaladoEm: cadastro?.playerInstaladoEm?.toISOString() ?? null,
    podeGerarCodigoPlay,
  };
}

export type InstalacaoClientePdvResumo = {
  portalPdvId: number;
  codigoDisplay: string;
  pdvNome: string;
  contatoLojaNome: string;
  contatoLojaEmail: string;
  contatoLojaTelefone: string;
  playerInstaladoEm: string | null;
  podeGerarCodigoPlay: boolean;
};

/** Todos os PDVs com ID Player de um cliente — para envio em lote. */
export async function listInstalacaoPdvsForCliente(portalClienteId: number): Promise<{
  portalClienteId: number;
  clienteNome: string;
  pdvs: InstalacaoClientePdvResumo[];
}> {
  const { rows } = await listPortalPlayerRows();
  const matching = rows.filter((r) => r.portalPlayerId?.portalClienteId === portalClienteId);

  let clienteNome = "Cliente";
  for (const r of matching) {
    if (r.clienteNome.trim()) {
      clienteNome = r.clienteNome.trim();
      break;
    }
  }

  if (matching.length === 0) {
    return { portalClienteId, clienteNome, pdvs: [] };
  }

  const rioPdvKeys = matching.map((r) => r.rioPdvId);
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: rioPdvKeys } },
    select: {
      rioPdvKey: true,
      contatoLojaNome: true,
      contatoLojaEmail: true,
      contatoLojaTelefone: true,
      playerInstaladoEm: true,
    },
  });
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const pdvs: InstalacaoClientePdvResumo[] = matching
    .slice()
    .sort((a, b) => a.portalPlayerId!.portalPdvId - b.portalPlayerId!.portalPdvId)
    .map((r) => {
      const link = r.portalPlayerId!;
      const cad = cadastroByKey.get(r.rioPdvId);
      return {
        portalPdvId: link.portalPdvId,
        codigoDisplay: formatPortalPdvIdDisplay(link.portalPdvId),
        pdvNome: r.rioPdvNome.trim() || formatPortalPdvIdDisplay(link.portalPdvId),
        contatoLojaNome: cad?.contatoLojaNome?.trim() ?? "",
        contatoLojaEmail: cad?.contatoLojaEmail?.trim() ?? "",
        contatoLojaTelefone: cad?.contatoLojaTelefone?.trim() ?? "",
        playerInstaladoEm: cad?.playerInstaladoEm?.toISOString() ?? null,
        podeGerarCodigoPlay: !cad?.playerInstaladoEm,
      };
    });

  return { portalClienteId, clienteNome, pdvs };
}

/**
 * Monta o link de instalação.
 * - padrao_cliente → guia PWA padrão (instalar.html / m/instalar.html) — não embarca PDV.
 * - pdv_login / pdv_senha_temp / pdv_senha_temp_migracao → instalar-pdv.html que embarca cliente+PDV.
 * - electron_ti → instalar-pdv.html com shell=ti (redireciona ao guia do .exe).
 */
export function buildInstallLink(
  tipo: InstalacaoTipo,
  plataforma: InstalacaoPlataforma,
  ctx: { portalClienteId: number; portalPdvId: number },
  opts?: { electronAuth?: ElectronAuthModo },
): string {
  const base = player5Origin();
  if (tipo === "padrao_cliente") {
    return plataforma === "mobile" ? `${base}/m/instalar.html` : `${base}/instalar.html`;
  }
  const params = new URLSearchParams({
    c: String(ctx.portalClienteId),
    p: String(ctx.portalPdvId),
  });
  if (tipo === "electron_ti") {
    params.set("shell", "ti");
    params.set("mode", opts?.electronAuth === "temp" ? "temp" : "login");
  } else {
    params.set(
      "mode",
      tipo === "pdv_senha_temp" || tipo === "pdv_senha_temp_migracao" ? "temp" : "login",
    );
  }
  if (tipo === "pdv_senha_temp_migracao") {
    params.set("migrate", "1");
  }
  if (plataforma === "mobile") params.set("m", "1");
  return `${base}/instalar-pdv.html?${params.toString()}`;
}

/** Login directo com PDV na URL — fallback quando PWA não herdou localStorage. */
export function buildTempLoginLink(
  ctx: { portalClienteId: number; portalPdvId: number },
  opts?: { mode?: "temp" | "migrate" | "login"; shell?: "ti" | "pwa" },
): string {
  const base = player5Origin();
  const params = new URLSearchParams({
    auth: "temp",
    c: String(ctx.portalClienteId),
    p: String(ctx.portalPdvId),
    mode: opts?.mode ?? "temp",
  });
  if (opts?.shell === "ti") params.set("shell", "ti");
  return `${base}/login?${params.toString()}`;
}

/** URL fixa do instalador .exe (Electron TI) no host do Player 5. */
export function buildElectronInstallerExeUrl(): string {
  return `${player5Origin()}/install/RadioIbiza-Setup.exe`;
}

/** Página de guia TI com parâmetros do PDV (download do .exe + pending install). */
export function buildElectronInstallerGuiaUrl(
  ctx: { portalClienteId: number; portalPdvId: number },
  electronAuth: ElectronAuthModo,
): string {
  const base = player5Origin();
  const params = new URLSearchParams({
    c: String(ctx.portalClienteId),
    p: String(ctx.portalPdvId),
    mode: electronAuth === "temp" ? "temp" : "login",
  });
  return `${base}/instalador-desktop/?${params.toString()}`;
}

const SENHA_TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SENHA_TEMP_LEN = 8;

/** Normaliza para hash (maiúsculas, sem espaços). */
export function normalizeSenhaTemp(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** SHA-256 hex — mesmo cálculo do cloud2 (validação de uso único no login). */
export function hashSenhaTemp(raw: string): string {
  return crypto.createHash("sha256").update(normalizeSenhaTemp(raw)).digest("hex");
}

function novaSenhaTempPlana(): string {
  const bytes = crypto.randomBytes(SENHA_TEMP_LEN);
  let out = "";
  for (let i = 0; i < SENHA_TEMP_LEN; i++) {
    out += SENHA_TEMP_ALPHABET[bytes[i] % SENHA_TEMP_ALPHABET.length];
  }
  return out;
}

/**
 * Gera uma nova senha temporária para o PDV (invalida as anteriores ativas).
 * Retorna a senha em texto puro — só é mostrada uma vez.
 */
export async function gerarSenhaTemporaria(
  portalClienteId: number,
  portalPdvId: number,
  criadaPor: string,
): Promise<string> {
  const senha = novaSenhaTempPlana();
  const senhaHash = hashSenhaTemp(senha);

  await prisma.$transaction([
    prisma.pdvInstalacaoSenhaTemp.updateMany({
      where: { portalClienteId, portalPdvId, ativa: true, usadaEm: null },
      data: { ativa: false },
    }),
    prisma.pdvInstalacaoSenhaTemp.create({
      data: {
        portalClienteId,
        portalPdvId,
        senhaHash,
        criadaPor: criadaPor.slice(0, 120),
      },
    }),
  ]);

  return senha;
}

export type InstalacaoEnvioLog = {
  id: string;
  tipo: string;
  plataforma: string;
  canal: string;
  destinoEmail: string;
  enviadoPor: string;
  createdAt: string;
};

export async function registrarEnvio(input: {
  portalClienteId: number;
  portalPdvId: number;
  tipo: InstalacaoTipo;
  plataforma: InstalacaoPlataforma;
  canal: InstalacaoCanal;
  destinoEmail: string;
  link: string;
  enviadoPor: string;
}): Promise<void> {
  await prisma.pdvInstalacaoEnvio.create({
    data: {
      portalClienteId: input.portalClienteId,
      portalPdvId: input.portalPdvId,
      tipo: input.tipo,
      plataforma: input.plataforma,
      canal: input.canal,
      destinoEmail: input.destinoEmail.slice(0, 400),
      link: input.link.slice(0, 800),
      enviadoPor: input.enviadoPor.slice(0, 120),
    },
  });
}

export async function listEnviosForPdv(
  portalClienteId: number,
  portalPdvId: number,
  limit = 30,
): Promise<InstalacaoEnvioLog[]> {
  const rows = await prisma.pdvInstalacaoEnvio.findMany({
    where: { portalClienteId, portalPdvId },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
  });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    plataforma: r.plataforma,
    canal: r.canal,
    destinoEmail: r.destinoEmail,
    enviadoPor: r.enviadoPor,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Log recente global (todos PDVs) — visão geral no rodapé do painel. */
export async function listEnviosRecentes(limit = 50): Promise<
  Array<InstalacaoEnvioLog & { portalClienteId: number; portalPdvId: number; codigoDisplay: string }>
> {
  const rows = await prisma.pdvInstalacaoEnvio.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    plataforma: r.plataforma,
    canal: r.canal,
    destinoEmail: r.destinoEmail,
    enviadoPor: r.enviadoPor,
    createdAt: r.createdAt.toISOString(),
    portalClienteId: r.portalClienteId,
    portalPdvId: r.portalPdvId,
    codigoDisplay: formatPortalPdvIdDisplay(r.portalPdvId),
  }));
}

export { portalClienteIdFromPdvId };
