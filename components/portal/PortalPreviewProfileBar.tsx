"use client";

import { usePortalPreviewProfile } from "@/components/portal/PortalPreviewProfileContext";

export function PortalPreviewProfileBar() {
  const ctx = usePortalPreviewProfile();
  if (!ctx?.isMaster) return null;

  const {
    isPreviewActive,
    previewProfile,
    previewUser,
    profiles,
    users,
    profilesLoading,
    setPreviewSlug,
    setPreviewUserEmail,
    clearPreview,
  } = ctx;

  if (isPreviewActive) {
    const label =
      previewUser ?
        `${previewUser.displayName} (${previewUser.profileName})`
      : previewProfile ?
        `${previewProfile.icon} ${previewProfile.name}`
      : "";
    return (
      <div
        className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        role="status"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0">
            <span className="font-semibold">Visualizando como {label}</span>
            <span className="mt-0.5 block text-[11px] opacity-80">
              Só a navegação muda — você continua logado como Master (APIs e dados reais).
            </span>
          </p>
          <button
            type="button"
            onClick={clearPreview}
            className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            Voltar ao Master
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200/80 bg-slate-50/90 px-4 py-1.5 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Visualizar como
        </span>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">Perfil</span>
          <select
            value=""
            disabled={profilesLoading}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v) setPreviewSlug(v);
            }}
            className="max-w-[11rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            aria-label="Visualizar portal como perfil"
          >
            <option value="">{profilesLoading ? "…" : "Escolher perfil…"}</option>
            {profiles.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">Usuário</span>
          <select
            value=""
            disabled={profilesLoading}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v) setPreviewUserEmail(v);
            }}
            className="max-w-[14rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            aria-label="Visualizar portal como usuário"
          >
            <option value="">{profilesLoading ? "…" : "Escolher usuário…"}</option>
            {users.map((u) => (
              <option key={u.email} value={u.email}>
                {u.displayName} · {u.profileName}
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-400">Prévia de menus — não altera sua sessão</span>
      </div>
    </div>
  );
}
