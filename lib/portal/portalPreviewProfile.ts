import {
  parseProfilePermissionsJson,
  type PortalPermissionsMap,
} from "@/lib/portal/menuPermissions";

export const PORTAL_PREVIEW_PROFILE_STORAGE_KEY = "portal_preview_profile_slug";
export const PORTAL_PREVIEW_PROFILE_EVENT = "portal-preview-profile-changed";

export type PortalPreviewProfileOption = {
  slug: string;
  name: string;
  icon: string;
  permissions: PortalPermissionsMap | "all";
};

export function readPreviewProfileSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PORTAL_PREVIEW_PROFILE_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function writePreviewProfileSlug(slug: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!slug) localStorage.removeItem(PORTAL_PREVIEW_PROFILE_STORAGE_KEY);
    else localStorage.setItem(PORTAL_PREVIEW_PROFILE_STORAGE_KEY, slug);
    window.dispatchEvent(new CustomEvent(PORTAL_PREVIEW_PROFILE_EVENT));
  } catch {
    //
  }
}

export function permissionsFromProfileJson(raw: string): PortalPermissionsMap | "all" {
  return parseProfilePermissionsJson(raw || "{}");
}

/** Permissões de menu efectivas (preview só altera UI; sessão continua master). */
export function resolveEffectiveMenuPermissions(
  real: PortalPermissionsMap | "all",
  preview: PortalPreviewProfileOption | null,
  isMaster: boolean,
): PortalPermissionsMap | "all" {
  if (!isMaster || !preview) return real;
  return preview.permissions;
}

/** Config master-only no topo — oculto em preview de perfil não-admin. */
export function resolveEffectiveIsMasterForNav(
  isMaster: boolean,
  preview: PortalPreviewProfileOption | null,
): boolean {
  if (!isMaster) return false;
  if (!preview) return true;
  return preview.permissions === "all" || preview.slug === "admin";
}

/** Itens só Rafael — visíveis só na visão master real. */
export function resolveEffectiveFluxoRafaelAdmin(
  fluxoRafaelAdmin: boolean,
  preview: PortalPreviewProfileOption | null,
  isMaster: boolean,
): boolean {
  if (!isMaster || preview) return false;
  return fluxoRafaelAdmin;
}
