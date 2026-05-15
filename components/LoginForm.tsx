"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMPANY_NAME } from "@/lib/brand";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const err = sp.get("error");
  const next = sp.get("next") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const configError =
    err === "config"
      ? "Login do portal não configurado. Defina PORTAL_SESSION_SECRET e PORTAL_USERS_JSON no servidor."
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, totp }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; disabled?: boolean };

      if (data.disabled) {
        router.replace(next.startsWith("/") ? next : "/");
        return;
      }

      if (!res.ok) {
        if (data.error === "invalid_totp") {
          setFormError("Código do Google Authenticator inválido ou expirado.");
        } else if (data.error === "invalid_credentials") {
          setFormError("Usuário ou senha incorretos.");
        } else if (data.error === "auth_not_configured") {
          setFormError("Autenticação não configurada no servidor.");
        } else {
          setFormError("Não foi possível entrar. Tente novamente.");
        }
        return;
      }

      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setFormError("Falha de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 py-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0066cc] dark:text-sky-400">
            {COMPANY_NAME}
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
            Acesso ao portal
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Informe usuário, senha e o código de 6 dígitos do Google Authenticator.
          </p>
        </div>
        <ThemeToggle />
      </div>

      {configError ? (
        <div
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
          role="alert"
        >
          {configError}
        </div>
      ) : null}

      {formError ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {formError}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Usuário
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            required
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Senha
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            required
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Código (Google Authenticator)
          <input
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="000000"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 tracking-widest text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-[#0066cc] py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-60 dark:bg-sky-600"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
