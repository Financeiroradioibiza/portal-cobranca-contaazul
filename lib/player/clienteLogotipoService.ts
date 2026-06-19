import { prisma } from "@/lib/prisma";

const MAX_BYTES = 400_000;

function parseBase64Image(raw: string): Buffer | null {
  const t = raw.trim();
  let b64 = t;
  const m = /^data:image\/(?:jpeg|jpg);base64,(.+)$/i.exec(t);
  if (m) b64 = m[1];
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 8 || buf.length > MAX_BYTES) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function getClienteLogotipoBase64(portalClienteId: number): Promise<string | null> {
  const row = await prisma.playerClienteLogotipo.findUnique({
    where: { portalClienteId },
    select: { jpegBase64: true },
  });
  return row?.jpegBase64?.trim() || null;
}

export async function saveClienteLogotipoFromBase64(
  portalClienteId: number,
  raw: string,
): Promise<void> {
  const buf = parseBase64Image(raw);
  if (!buf) throw new Error("jpeg_invalido");
  const jpegBase64 = buf.toString("base64");
  await prisma.playerClienteLogotipo.upsert({
    where: { portalClienteId },
    create: { portalClienteId, jpegBase64 },
    update: { jpegBase64 },
  });
}

export async function deleteClienteLogotipo(portalClienteId: number): Promise<void> {
  await prisma.playerClienteLogotipo.deleteMany({ where: { portalClienteId } });
}

export function bufferFromStoredBase64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}
