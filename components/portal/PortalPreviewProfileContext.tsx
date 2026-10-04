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
  readPreviewUserEmail,
  writePreviewProfileSlug,
  writePreviewUserEmail,
  type PortalPreviewProfileOption,
  type PortalPreviewUserOption,
} from "@/lib/portal/portalPreviewProfile";
import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";

type PortalPreviewProfileContextValue = {
  isMaster: boolean;
  profiles: PortalPreviewProfileOption[];
  users: PortalPreviewUserOption[];
  profilesLoading: boolean;
  previewSlug: string | null;
  previewProfile: PortalPreviewProfileOption | null;
  previewUserEmail: string | null;
  previewUser: PortalPreviewUserOption | null;
  isPreviewActive: boolean;
  setPreviewSlug: (slug: string | null) => void;
  setPreviewUserEmail: (email: string | null) => void;
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
  const [users, setUsers] = useState<PortalPreviewUserOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [previewSlug, setPreviewSlugState] = useState<string | null>(null);
  const [previewUserEmail, setPreviewUserEmailState] = useState<string | null>(null);

  const syncFromStorage = useCallback(() => {
    setPreviewSlugState(readPreviewProfileSlug());
    setPreviewUserEmailState(readPreviewUserEmail());
  }, []);

  useEffect(() => {
    syncFromStorage();
    const onChange = () => syncFromStorage();
    window.addEventListener(PORTAL_PREVIEW_PROFILE_EVENT, onChange);
    return () => window.removeEventListener(PORTAL_PREVIEW_PROFILE_EVENT, onChange);
  }, [syncFromStorage]);

  useEffect(() => {
    if (!isMaster) return;
    let cancelled = false;
    setProfilesLoading(true);
    Promise.all([
      fetch("/api/config/profiles/preview-list", { credentials: "same-origin" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch("/api/config/users/preview-list", { credentials: "same-origin" }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([profData, userData]) => {
        if (cancelled) return;
        if (profData?.profiles) setProfiles(mapProfilesFromApi(profData.profiles));
        if (userData?.users) setUsers(userData.users as PortalPreviewUserOption[]);
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
    if (!isMaster || profilesLoading) return;
    if (previewSlug && profiles.length > 0 && !profiles.some((p) => p.slug === previewSlug)) {
      writePreviewProfileSlug(null);
      setPreviewSlugState(null);
    }
    if (previewUserEmail && users.length > 0 && !users.some((u) => u.email === previewUserEmail)) {
      writePreviewUserEmail(null);
      setPreviewUserEmailState(null);
    }
  }, [isMaster, profiles, users, profilesLoading, previewSlug, previewUserEmail]);

  const setPreviewSlug = useCallback(
    (slug: string | null) => {
      if (!isMaster) return;
      writePreviewProfileSlug(slug);
      setPreviewSlugState(slug);
      if (slug) setPreviewUserEmailState(null);
    },
    [isMaster],
  );

  const setPreviewUserEmail = useCallback(
    (email: string | null) => {
      if (!isMaster) return;
      writePreviewUserEmail(email);
      setPreviewUserEmailState(email);
      if (email) setPreviewSlugState(null);
    },
    [isMaster],
  );

  const clearPreview = useCallback(() => {
    writePreviewProfileSlug(null);
    writePreviewUserEmail(null);
    setPreviewSlugState(null);
    setPreviewUserEmailState(null);
  }, []);

  const previewProfile = useMemo(
    () => profiles.find((p) => p.slug === previewSlug) ?? null,
    [profiles, previewSlug],
  );

  const previewUser = useMemo(
    () => users.find((u) => u.email === previewUserEmail) ?? null,
    [users, previewUserEmail],
  );

  const isPreviewActive = Boolean(isMaster && (previewProfile || previewUser));

  const value = useMemo((): PortalPreviewProfileContextValue => {
    let effectiveMenuPermissions = realMenuPermissions;
    if (isMaster && previewUser) effectiveMenuPermissions = previewUser.permissions;
    else if (isMaster && previewProfile) effectiveMenuPermissions = previewProfile.permissions;

    let effectiveIsMasterForNav = !isMaster ? false : !previewProfile && !previewUser;
    if (isMaster && previewUser) {
      effectiveIsMasterForNav =
        previewUser.permissions === "all" || previewUser.profileSlug === "admin";
    } else if (isMaster && previewProfile) {
      effectiveIsMasterForNav =
        previewProfile.permissions === "all" || previewProfile.slug === "admin";
    }

    const effectiveFluxoRafaelAdmin =
      isMaster && !previewProfile && !previewUser ? fluxoRafaelAdmin : false;

    return {
      isMaster,
      profiles,
      users,
      profilesLoading,
      previewSlug,
      previewProfile,
      previewUserEmail,
      previewUser,
      isPreviewActive,
      setPreviewSlug,
      setPreviewUserEmail,
      clearPreview,
      effectiveMenuPermissions,
      effectiveIsMasterForNav,
      effectiveFluxoRafaelAdmin,
    };
  }, [
    isMaster,
    profiles,
    users,
    profilesLoading,
    previewSlug,
    previewProfile,
    previewUserEmail,
    previewUser,
    isPreviewActive,
    setPreviewSlug,
    setPreviewUserEmail,
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
