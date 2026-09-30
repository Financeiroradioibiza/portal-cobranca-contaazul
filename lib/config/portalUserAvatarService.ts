import { prisma } from "@/lib/prisma";
import {
  PORTAL_USER_AVATAR_MAX_BYTES,
  isAllowedPortalUserAvatarMime,
  portalUserHasAvatar,
} from "@/lib/config/portalUserAvatar";

export async function getPortalUserAvatarFile(
  userId: string,
): Promise<{ mimeType: string; data: Buffer } | null> {
  const row = await prisma.portalUser.findUnique({
    where: { id: userId },
    select: { avatarMime: true, avatarBase64: true },
  });
  if (!row || !portalUserHasAvatar(row)) return null;
  return {
    mimeType: row.avatarMime,
    data: Buffer.from(row.avatarBase64, "base64"),
  };
}

export async function setPortalUserAvatar(
  userId: string,
  file: { bytes: Buffer; mimeType: string },
): Promise<void> {
  if (file.bytes.length > PORTAL_USER_AVATAR_MAX_BYTES) throw new Error("file_too_large");
  const mimeType = file.mimeType.trim().slice(0, 80);
  if (!isAllowedPortalUserAvatarMime(mimeType)) throw new Error("mime_not_allowed");
  const exists = await prisma.portalUser.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw new Error("not_found");
  await prisma.portalUser.update({
    where: { id: userId },
    data: {
      avatarMime: mimeType,
      avatarBase64: file.bytes.toString("base64"),
    },
  });
}

export async function clearPortalUserAvatar(userId: string): Promise<void> {
  await prisma.portalUser.update({
    where: { id: userId },
    data: { avatarMime: "", avatarBase64: "" },
  });
}
