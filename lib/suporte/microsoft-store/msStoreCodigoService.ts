import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_BODY_LEN = 8;

export function normalizeMsStoreCodigo(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export function hashMsStoreCodigo(raw: string): string {
  return crypto.createHash("sha256").update(normalizeMsStoreCodigo(raw)).digest("hex");
}

export function formatMsStoreCodigoDisplay(normalized: string): string {
  const n = normalizeMsStoreCodigo(normalized);
  if (n.startsWith("MS8") && n.length >= 11) {
    return `MS8-${n.slice(3, 7)}-${n.slice(7, 11)}`;
  }
  return n;
}

function novaMsStoreCodigoCorpo(): string {
  const bytes = crypto.randomBytes(CODE_BODY_LEN);
  let out = "";
  for (let i = 0; i < CODE_BODY_LEN; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `MS8${out}`;
}

async function pdvLivreParaCodigo(rioPdvKey: string): Promise<boolean> {
  const cad = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey },
    select: { playerInstaladoEm: true },
  });
  return !cad?.playerInstaladoEm;
}

export async function invalidarCodigosMsStorePendentes(
  portalClienteId: number,
  portalPdvId: number,
): Promise<number> {
  const r = await prisma.pdvInstalacaoMsstoreCodigo.updateMany({
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

export async function gerarCodigoMsStoreInstalacao(input: {
  portalClienteId: number;
  portalPdvId: number;
  rioPdvKey: string;
  criadaPor: string;
}): Promise<string> {
  const livre = await pdvLivreParaCodigo(input.rioPdvKey);
  if (!livre) {
    throw new Error("pdv_com_player_instalado");
  }

  await invalidarCodigosMsStorePendentes(input.portalClienteId, input.portalPdvId);

  const codigo = novaMsStoreCodigoCorpo();
  const codigoHash = hashMsStoreCodigo(codigo);

  await prisma.pdvInstalacaoMsstoreCodigo.create({
    data: {
      portalClienteId: input.portalClienteId,
      portalPdvId: input.portalPdvId,
      rioPdvKey: input.rioPdvKey,
      codigoHash,
      criadaPor: input.criadaPor.slice(0, 120),
    },
  });

  return formatMsStoreCodigoDisplay(codigo);
}
