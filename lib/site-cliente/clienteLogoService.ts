import { prisma } from "@/lib/prisma";
import {
  deleteClienteLogotipo,
  getClienteLogotipoBase64,
  saveClienteLogotipoFromBase64,
} from "@/lib/player/clienteLogotipoService";

export async function getSiteClienteLogoBase64(
  grupoId: string,
  rioLinhaId: string,
  portalClienteId: number | null,
): Promise<string | null> {
  if (portalClienteId != null && portalClienteId > 0) {
    const player = await getClienteLogotipoBase64(portalClienteId);
    if (player) return player;
  }

  const mood = await prisma.siteClienteMoodboard.findUnique({
    where: { grupoId_rioLinhaId: { grupoId, rioLinhaId } },
    select: { logoJpegBase64: true },
  });
  return mood?.logoJpegBase64?.trim() || null;
}

export async function siteClienteHasLogo(
  grupoId: string,
  rioLinhaId: string,
  portalClienteId: number | null,
): Promise<boolean> {
  const b64 = await getSiteClienteLogoBase64(grupoId, rioLinhaId, portalClienteId);
  return Boolean(b64);
}

export async function saveSiteClienteLogo(
  grupoId: string,
  rioLinhaId: string,
  portalClienteId: number | null,
  rawBase64: string,
): Promise<void> {
  if (portalClienteId != null && portalClienteId > 0) {
    await saveClienteLogotipoFromBase64(portalClienteId, rawBase64);
  }

  const buf = parseJpegBase64(rawBase64);
  if (!buf) throw new Error("jpeg_invalido");
  const jpegBase64 = buf.toString("base64");

  await prisma.siteClienteMoodboard.upsert({
    where: { grupoId_rioLinhaId: { grupoId, rioLinhaId } },
    create: {
      grupoId,
      rioLinhaId,
      portalClienteId,
      logoJpegBase64: jpegBase64,
    },
    update: {
      portalClienteId: portalClienteId ?? undefined,
      logoJpegBase64: jpegBase64,
    },
  });
}

export async function deleteSiteClienteLogo(
  grupoId: string,
  rioLinhaId: string,
  portalClienteId: number | null,
): Promise<void> {
  if (portalClienteId != null && portalClienteId > 0) {
    await deleteClienteLogotipo(portalClienteId);
  }

  const mood = await prisma.siteClienteMoodboard.findUnique({
    where: { grupoId_rioLinhaId: { grupoId, rioLinhaId } },
    select: { id: true, logoJpegBase64: true },
  });
  if (mood?.logoJpegBase64) {
    await prisma.siteClienteMoodboard.update({
      where: { grupoId_rioLinhaId: { grupoId, rioLinhaId } },
      data: { logoJpegBase64: "" },
    });
  }
}

function parseJpegBase64(raw: string): Buffer | null {
  const t = raw.trim();
  let b64 = t;
  const m = /^data:image\/(?:jpeg|jpg);base64,(.+)$/i.exec(t);
  if (m) b64 = m[1];
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 8 || buf.length > 400_000) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return buf;
  } catch {
    return null;
  }
}
