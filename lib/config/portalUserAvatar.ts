/** Limite da foto de perfil (bytes). */
export const PORTAL_USER_AVATAR_MAX_BYTES = 512 * 1024;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isAllowedPortalUserAvatarMime(mime: string): boolean {
  return ALLOWED.has(mime.toLowerCase().split(";")[0]!.trim());
}

export function portalUserHasAvatar(row: { avatarMime: string; avatarBase64: string }): boolean {
  return Boolean(row.avatarMime.trim() && row.avatarBase64.trim());
}

export function portalUserAvatarUrl(userId: string, version?: string | number): string {
  const base = `/api/config/users/${userId}/avatar`;
  if (version == null || version === "") return base;
  return `${base}?v=${encodeURIComponent(String(version))}`;
}
