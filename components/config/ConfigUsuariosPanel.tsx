"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PORTAL_MENU_MODULES,
  type PortalMenuModuleId,
  type PortalPermissionsMap,
  isSubAllowed,
  parseRolesJson,
} from "@/lib/portal/menuPermissions";
import {
  formatRelativeLogin,
  initials,
  profileBadgeClass,
  profileBadgeLabel,
} from "@/lib/config/portalUserService";

type ProfileRow = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  permissionsJson: string;
  rolesJson: string;
  userCount: number;
};

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string;
  active: boolean;
  lastLoginAt: string | null;
  profile: { id: string; slug: string; name: string; icon: string };
};

type Stats = { total: number; admins: number; operadores: number; convidados: number };

function parseProfilePerm(raw: string): PortalPermissionsMap | "all" {
  try {
    const v = JSON.parse(raw || "{}");
    if (v === "all") return "all";
    if (v && typeof v === "object") return v as PortalPermissionsMap;
  } catch {
    /* ignore */
  }
  return {};
}

function avatarGradient(seed: string): string {
  const hues = [320, 260, 210, 170, 30, 280];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % hues.length;
  const a = hues[h]!;
  const b = hues[(h + 2) % hues.length]!;
  return `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${b} 65% 50%))`;
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-white"
          style={{ background: tone }}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

export function ConfigUsuariosPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, admins: 0, operadores: 0, convidados: 0 });
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [permDraft, setPermDraft] = useState<PortalPermissionsMap | "all">("all");
  const [permDirty, setPermDirty] = useState(false);
  const [savingPerm, setSavingPerm] = useState(false);

  const [showNewUser, setShowNewUser] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [totpReveal, setTotpReveal] = useState<string | null>(null);

  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formJob, setFormJob] = useState("");
  const [formProfileId, setFormProfileId] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null,
    [profiles, selectedProfileId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/config/users");
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as {
        users: UserRow[];
        profiles: ProfileRow[];
        stats: Stats;
      };
      setUsers(data.users);
      setProfiles(data.profiles);
      setStats(data.stats);
      if (!selectedProfileId && data.profiles[0]) {
        setSelectedProfileId(data.profiles[0].id);
        setPermDraft(parseProfilePerm(data.profiles[0].permissionsJson));
      }
    } catch {
      setError("Não foi possível carregar usuários e perfis.");
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedProfile) return;
    setPermDraft(parseProfilePerm(selectedProfile.permissionsJson));
    setPermDirty(false);
  }, [selectedProfile?.id, selectedProfile?.permissionsJson]);

  function selectProfile(p: ProfileRow) {
    setSelectedProfileId(p.id);
  }

  function toggleSub(moduleId: PortalMenuModuleId, subId: string) {
    setPermDraft((prev) => {
      if (prev === "all") {
        const next: PortalPermissionsMap = Object.fromEntries(
          PORTAL_MENU_MODULES.map((m) => [
            m.id,
            m.id === moduleId ?
              m.subs.filter((s) => s.id !== subId).map((s) => s.id)
            : "all",
          ]),
        ) as PortalPermissionsMap;
        return next;
      }

      const mod = PORTAL_MENU_MODULES.find((m) => m.id === moduleId);
      if (!mod) return prev;

      const current = prev[moduleId];
      let subs: string[];
      if (current === "all") {
        subs = mod.subs.filter((s) => s.id !== subId).map((s) => s.id);
      } else if (Array.isArray(current)) {
        subs =
          current.includes(subId) ?
            current.filter((x) => x !== subId)
          : [...current, subId];
      } else {
        subs = [subId];
      }
      return { ...prev, [moduleId]: subs.length ? subs : undefined };
    });
    setPermDirty(true);
  }

  function toggleModuleAll(moduleId: PortalMenuModuleId) {
    setPermDraft((prev) => {
      const mod = PORTAL_MENU_MODULES.find((m) => m.id === moduleId);
      if (!mod) return prev;
      if (prev === "all") {
        const map = Object.fromEntries(
          PORTAL_MENU_MODULES.map((m) => [m.id, m.id === moduleId ? "all" : undefined]),
        ) as PortalPermissionsMap;
        return map;
      }
      const allOn = mod.subs.every((s) => isSubAllowed(moduleId, s.id, prev));
      if (allOn) {
        const next = { ...prev };
        delete next[moduleId];
        return next;
      }
      return { ...prev, [moduleId]: "all" };
    });
    setPermDirty(true);
  }

  async function savePermissions() {
    if (!selectedProfile) return;
    setSavingPerm(true);
    try {
      const permissionsJson =
        permDraft === "all" ? JSON.stringify("all") : JSON.stringify(permDraft);
      const rolesJson = selectedProfile.rolesJson;
      const res = await fetch(`/api/config/profiles/${selectedProfile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionsJson, rolesJson }),
      });
      if (!res.ok) throw new Error("save_failed");
      setPermDirty(false);
      await load();
    } catch {
      alert("Erro ao salvar permissões.");
    } finally {
      setSavingPerm(false);
    }
  }

  function openNewUser() {
    setFormEmail("");
    setFormName("");
    setFormJob("");
    setFormProfileId(profiles[0]?.id ?? "");
    setFormPassword("");
    setShowNewUser(true);
    setEditUser(null);
    setTotpReveal(null);
  }

  function openEditUser(u: UserRow) {
    setEditUser(u);
    setFormName(u.displayName);
    setFormJob(u.jobTitle);
    setFormProfileId(u.profile.id);
    setFormPassword("");
    setFormActive(u.active);
    setShowNewUser(false);
    setTotpReveal(null);
  }

  async function submitNewUser() {
    setFormSaving(true);
    try {
      const res = await fetch("/api/config/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          displayName: formName,
          jobTitle: formJob,
          profileId: formProfileId,
          password: formPassword,
        }),
      });
      const data = (await res.json()) as { error?: string; totpSecret?: string };
      if (!res.ok) {
        alert(data.error === "email_exists" ? "E-mail já cadastrado." : "Erro ao criar usuário.");
        return;
      }
      setTotpReveal(data.totpSecret ?? null);
      setShowNewUser(false);
      await load();
    } finally {
      setFormSaving(false);
    }
  }

  async function submitEditUser() {
    if (!editUser) return;
    setFormSaving(true);
    try {
      const res = await fetch(`/api/config/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: formName,
          jobTitle: formJob,
          profileId: formProfileId,
          active: formActive,
          password: formPassword || undefined,
        }),
      });
      const data = (await res.json()) as { totpSecret?: string };
      if (!res.ok) {
        alert("Erro ao salvar usuário.");
        return;
      }
      setEditUser(null);
      if (data.totpSecret) setTotpReveal(data.totpSecret);
      await load();
    } finally {
      setFormSaving(false);
    }
  }

  async function resetTotp(u: UserRow) {
    if (!confirm(`Gerar novo código Authenticator para ${u.displayName || u.email}?`)) return;
    const res = await fetch(`/api/config/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetTotp: true }),
    });
    const data = (await res.json()) as { totpSecret?: string };
    if (res.ok && data.totpSecret) {
      setTotpReveal(data.totpSecret);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 text-sm text-red-600">{error}</div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-6 sm:px-4">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Configuração / Usuários
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários e perfis</h1>
        </div>
        <button
          type="button"
          onClick={openNewUser}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          <span className="text-lg leading-none">+</span> Novo usuário
        </button>
      </div>

      {totpReveal ?
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Segredo Google Authenticator (copie agora — não será exibido de novo):
          </p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-base dark:bg-slate-900">
            {totpReveal}
          </code>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-amber-800 underline dark:text-amber-200"
            onClick={() => setTotpReveal(null)}
          >
            Fechar
          </button>
        </div>
      : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="👤" label="Total" value={stats.total} hint="usuários ativos" tone="#e879f9" />
        <StatCard icon="⭐" label="Admins" value={stats.admins} hint="acesso total" tone="#a855f7" />
        <StatCard icon="🛠" label="Operadores" value={stats.operadores} hint="criação + suporte" tone="#3b82f6" />
        <StatCard icon="👁" label="Convidados" value={stats.convidados} hint="só leitura" tone="#f97316" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-bold">Equipe interna</h3>
        </div>
        <div className="hidden grid-cols-[48px_1fr_1fr_120px_100px_40px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 md:grid">
          <span />
          <span>Nome</span>
          <span>Cargo</span>
          <span>Perfil</span>
          <span>Último login</span>
          <span />
        </div>
        {users.length === 0 ?
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Nenhum usuário no banco. Crie o primeiro ou continue usando{" "}
            <code className="text-xs">PORTAL_USERS_JSON</code> no deploy.
          </div>
        : users.map((u) => (
            <div
              key={u.id}
              className={
                "grid grid-cols-1 gap-2 border-t border-slate-100 px-4 py-3 md:grid-cols-[48px_1fr_1fr_120px_100px_40px] md:items-center md:gap-3 dark:border-slate-800 " +
                (u.active ? "" : "opacity-50")
              }
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: avatarGradient(u.email) }}
              >
                {initials(u.displayName, u.email)}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{u.displayName || "—"}</div>
                <div className="truncate text-xs text-slate-500">{u.email}</div>
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300">{u.jobTitle || "—"}</div>
              <div>
                <span
                  className={
                    "inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide " +
                    profileBadgeClass(u.profile.slug)
                  }
                >
                  {profileBadgeLabel(u.profile.slug)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {formatRelativeLogin(u.lastLoginAt)}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Editar"
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => openEditUser(u)}
                >
                  ✎
                </button>
              </div>
            </div>
          ))
        }
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          🔐 Perfis e permissões
        </h3>
        <span className="text-xs text-slate-400">
          Defina quais menus cada perfil pode acessar
        </span>
        {permDirty ?
          <button
            type="button"
            disabled={savingPerm}
            onClick={() => void savePermissions()}
            className="ms-auto rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {savingPerm ? "Salvando…" : "Salvar permissões"}
          </button>
        : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="mb-2 text-xs font-bold text-slate-500">
            Perfis ({profiles.length})
          </h4>
          <div className="space-y-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProfile(p)}
                className={
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors " +
                  (selectedProfile?.id === p.id ?
                    "bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800")
                }
              >
                <span>{p.icon}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold tabular-nums dark:bg-slate-800">
                  {p.userCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {selectedProfile ?
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span>{selectedProfile.icon}</span>
                  {selectedProfile.name}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {selectedProfile.description}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Papéis JWT: {parseRolesJson(selectedProfile.rolesJson).join(", ") || "—"}
                </p>
              </div>
              <div className="space-y-4">
                {PORTAL_MENU_MODULES.map((mod) => {
                  const perm = permDraft;
                  const moduleAll =
                    perm === "all" ||
                    (perm as PortalPermissionsMap)[mod.id] === "all" ||
                    mod.subs.every((s) => isSubAllowed(mod.id, s.id, perm));
                  return (
                    <div key={mod.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                      <label className="mb-2 flex cursor-pointer items-center gap-2 font-semibold">
                        <input
                          type="checkbox"
                          checked={moduleAll}
                          onChange={() => toggleModuleAll(mod.id)}
                        />
                        <span>{mod.icon}</span>
                        {mod.label}
                      </label>
                      <div className="ms-6 space-y-1">
                        {mod.subs.map((sub) => (
                          <label
                            key={sub.id}
                            className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                          >
                            <input
                              type="checkbox"
                              checked={isSubAllowed(mod.id, sub.id, perm)}
                              onChange={() => toggleSub(mod.id, sub.id)}
                            />
                            {sub.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          : null}
        </div>
      </div>

      {(showNewUser || editUser) ?
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-bold">
              {editUser ? "Editar usuário" : "Novo usuário"}
            </h2>
            <div className="mt-4 space-y-3">
              {!editUser ?
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">E-mail</span>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              : null}
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nome</span>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Cargo</span>
                <input
                  value={formJob}
                  onChange={(e) => setFormJob(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Perfil</span>
                <select
                  value={formProfileId}
                  onChange={(e) => setFormProfileId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  {editUser ? "Nova senha (opcional)" : "Senha inicial"}
                </span>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              {editUser ?
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  Usuário ativo
                </label>
              : null}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {editUser ?
                <button
                  type="button"
                  className="me-auto text-xs font-semibold text-amber-700 underline"
                  onClick={() => void resetTotp(editUser)}
                >
                  Resetar Authenticator
                </button>
              : null}
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setShowNewUser(false);
                  setEditUser(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={formSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                onClick={() => void (editUser ? submitEditUser() : submitNewUser())}
              >
                {formSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      : null}
    </div>
  );
}
