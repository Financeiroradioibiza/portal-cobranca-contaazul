"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PORTAL_PREVIEW_PROFILE_EVENT,
  permissionsFromProfileJson,
  readPreviewProfileSlug,
  writePreviewProfileSlug,
  type PortalPreviewProfileOption,
} from "@/lib/portal/portalPreviewProfile";
import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";

type PortalPreviewProfileContextValue = {
  isMaster: boolean;
  profiles: PortalPreviewProfileOption[];
  profilesLoading: boolean;
  previewSlug: string | null;
  previewProfile: PortalPreviewProfileOption | null;
  isPreviewActive: boolean;
  setPreviewSlug: (slug: string | null) => void;
  clearPreview: () => void;
  effectiveMenuPermissions: PortalPermissionsMap | "all";
  effectiveIsMasterForNav: boolean;
  effectiveFluxoRafaelAdmin: boolean;
};

const PortalPreviewProfileContext = createContext<PortalPreviewProfileContextValue | null>(null);

function mapProfilesFromApi(
  rows: Array<{ slug: string; name: string; icon: string; permissionsJson: string }>,
): PortalPreviewProfileOption[] {
  return rows
    .filter((p) => p.slug !== "admin")
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      icon: p.icon || "👤",
      permissions: permissionsFromProfileJson(p.permissionsJson),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function PortalPreviewProfileProvider({
  isMaster,
  realMenuPermissions,
  fluxoRafaelAdmin,
  children,
}: {
  isMaster: boolean;
  realMenuPermissions: PortalPermissionsMap | "all";
  fluxoRafaelAdmin: boolean;
  children: ReactNode;
}) {
  const [profiles, setProfiles] = useState<PortalPreviewProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [previewSlug, setPreviewSlugState] = useState<string | null>(null);

  useEffect(() => {
    setPreviewSlugState(readPreviewProfileSlug());
    const onChange = () => setPreviewSlugState(readPreviewProfileSlug());
    window.addEventListener(PORTAL_PREVIEW_PROFILE_EVENT, onChange);
    return () => window.removeEventListener(PORTAL_PREVIEW_PROFILE_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!isMaster) return;
    let cancelled = false;
    setProfilesLoading(true);
    fetch("/api/config/profiles/preview-list", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { profiles?: Array<{ slug: string; name: string; icon: string; permissionsJson: string }> } | null) => {
        if (cancelled || !data?.profiles) return;
        setProfiles(mapProfilesFromApi(data.profiles));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProfilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isMaster]);

  useEffect(() => {
    if (!isMaster || profilesLoading || !previewSlug) return;
    if (profiles.length > 0 && !profiles.some((p) => p.slug === previewSlug)) {
      writePreviewProfileSlug(null);
      setPreviewSlugState(null);
    }
  }, [isMaster, profiles, profilesLoading, previewSlug]);

  const setPreviewSlug = useCallback(
    (slug: string | null) => {
      if (!isMaster) return;
      writePreviewProfileSlug(slug);
      setPreviewSlugState(slug);
    },
    [isMaster],
  );

  const clearPreview = useCallback(() => {
    setPreviewSlug(null);
  }, [setPreviewSlug]);

  const previewProfile = useMemo(
    () => profiles.find((p) => p.slug === previewSlug) ?? null,
    [profiles, previewSlug],
  );

  const isPreviewActive = Boolean(isMaster && previewProfile);

  const value = useMemo((): PortalPreviewProfileContextValue => {
    const effectiveMenuPermissions =
      isMaster && previewProfile ? previewProfile.permissions : realMenuPermissions;
    const effectiveIsMasterForNav = !isMaster ? false : !previewProfile;
    const effectiveFluxoRafaelAdmin = isMaster && !previewProfile ? fluxoRafaelAdmin : false;

    return {
      isMaster,
      profiles,
      profilesLoading,
      previewSlug,
      previewProfile,
      isPreviewActive,
      setPreviewSlug,
      clearPreview,
      effectiveMenuPermissions,
      effectiveIsMasterForNav,
      effectiveFluxoRafaelAdmin,
    };
  }, [
    isMaster,
    profiles,
    profilesLoading,
    previewSlug,
    previewProfile,
    isPreviewActive,
    setPreviewSlug,
    clearPreview,
    realMenuPermissions,
    fluxoRafaelAdmin,
  ]);

  return (
    <PortalPreviewProfileContext.Provider value={value}>{children}</PortalPreviewProfileContext.Provider>
  );
}

export function usePortalPreviewProfile(): PortalPreviewProfileContextValue | null {
  return useContext(PortalPreviewProfileContext);
}
