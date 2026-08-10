"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SiteClienteLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/site-cliente/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginEmail, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.error === "credenciais_invalidas"
            ? "E-mail ou senha incorretos."
            : "Não foi possível entrar.",
        );
        return;
      }
      const next = searchParams.get("next") || "/site-cliente";
      router.push(next.startsWith("/site-cliente") ? next : "/site-cliente");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-100">{error}</div>
      ) : null}
      <div>
        <label className="mb-1 block text-xs font-medium text-white/70">E-mail de acesso</label>
        <input
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:border-fuchsia-400 focus:outline-none"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-white/70">Senha</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:border-fuchsia-400 focus:outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 py-3 font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
