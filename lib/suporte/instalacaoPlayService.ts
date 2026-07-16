import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_BODY_LEN = 8;

/** Normaliza código PL5 (remove hífens/espaços, maiúsculas). */
export function normalizePlayCodigo(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export function hashPlayCodigo(raw: string): string {
  return crypto.createHash("sha256").update(normalizePlayCodigo(raw)).digest("hex");
}

/** Ex.: PL5K7P2QM4X → PL5-K7P2-QM4X */
export function formatPlayCodigoDisplay(normalized: string): string {
  const n = normalizePlayCodigo(normalized);
  if (n.startsWith("PL5") && n.length >= 11) {
    return `PL5-${n.slice(3, 7)}-${n.slice(7, 11)}`;
  }
  return n;
}

function novaPlayCodigoCorpo(): string {
  const bytes = crypto.randomBytes(CODE_BODY_LEN);
  let out = "";
  for (let i = 0; i < CODE_BODY_LEN; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `PL5${out}`;
}

export async function pdvLivreParaCodigoPlay(rioPdvKey: string): Promise<boolean> {
  const cad = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey },
    select: { playerInstaladoEm: true },
  });
  return !cad?.playerInstaladoEm;
}

export async function invalidarCodigosPlayPendentes(
  portalClienteId: number,
  portalPdvId: number,
): Promise<number> {
  const r = await prisma.pdvInstalacaoPlayCodigo.updateMany({
    where: {
      portalClienteId,
      portalPdvId,
      ativa: true,
      usadaEm: null,
    },
    data: { ativa: false },
  });
  return r.count;
}

export type PlayCodigoLogRow = {
  id: string;
  codigoDisplay: string;
  usadaEm: string | null;
  ativa: boolean;
  criadaPor: string;
  createdAt: string;
};

export async function listCodigosPlayForPdv(
  portalClienteId: number,
  portalPdvId: number,
  limit = 20,
): Promise<PlayCodigoLogRow[]> {
  const rows = await prisma.pdvInstalacaoPlayCodigo.findMany({
    where: { portalClienteId, portalPdvId },
    orderBy: { createdAt: "desc" },
    take: Math.min(50, Math.max(1, limit)),
  });
  return rows.map((r) => ({
    id: r.id,
    codigoDisplay: r.usadaEm ? "••••••••" : "(código oculto após geração)",
    usadaEm: r.usadaEm?.toISOString() ?? null,
    ativa: r.ativa,
    criadaPor: r.criadaPor,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Gera código Instalação 5 (Google Play). Exige PDV sem vínculo (`playerInstaladoEm` null).
 * Invalida códigos pendentes não usados do mesmo PDV.
 */
export async function gerarCodigoPlayInstalacao(input: {
  portalClienteId: number;
  portalPdvId: number;
  rioPdvKey: string;
  criadaPor: string;
}): Promise<string> {
  const livre = await pdvLivreParaCodigoPlay(input.rioPdvKey);
  if (!livre) {
    throw new Error("pdv_com_player_instalado");
  }

  await invalidarCodigosPlayPendentes(input.portalClienteId, input.portalPdvId);

  const codigo = novaPlayCodigoCorpo();
  const codigoHash = hashPlayCodigo(codigo);

  await prisma.pdvInstalacaoPlayCodigo.create({
    data: {
      portalClienteId: input.portalClienteId,
      portalPdvId: input.portalPdvId,
      rioPdvKey: input.rioPdvKey,
      codigoHash,
      criadaPor: input.criadaPor.slice(0, 120),
    },
  });

  return formatPlayCodigoDisplay(codigo);
}
