import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { listPortalPlayerRows } from "@/lib/player/listPortalPlayerRows";
import { ensurePdvInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";
import { formatPortalPdvIdDisplay, portalClienteIdFromPdvId } from "@/lib/player/portalPlayerIds";

export type InstalacaoTipo = "padrao_cliente" | "pdv_login" | "pdv_senha_temp" | "pdv_senha_temp_migracao";
export type InstalacaoPlataforma = "windows" | "mobile";
export type InstalacaoCanal = "email" | "link";

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
    },
  });

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
  };
}

/**
 * Monta o link de instalação.
 * - padrao_cliente → guia PWA padrão (instalar.html / m/instalar.html) — não embarca PDV.
 * - pdv_login / pdv_senha_temp / pdv_senha_temp_migracao → instalar-pdv.html que embarca cliente+PDV.
 */
export function buildInstallLink(
  tipo: InstalacaoTipo,
  plataforma: InstalacaoPlataforma,
  ctx: { portalClienteId: number; portalPdvId: number },
): string {
  const base = player5Origin();
  if (tipo === "padrao_cliente") {
    return plataforma === "mobile" ? `${base}/m/instalar.html` : `${base}/instalar.html`;
  }
  const mode =
    tipo === "pdv_senha_temp_migracao" ? "migrate" : tipo === "pdv_senha_temp" ? "temp" : "login";
  const params = new URLSearchParams({
    c: String(ctx.portalClienteId),
    p: String(ctx.portalPdvId),
    mode,
  });
  if (plataforma === "mobile") params.set("m", "1");
  return `${base}/instalar-pdv.html?${params.toString()}`;
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
