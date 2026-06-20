"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyTextButton } from "@/components/CopyTextButton";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

type LoginRow = {
  portalClienteId: number;
  clienteNome: string;
  email: string;
  password: string | null;
  suggestedPassword: string;
  pdvCount: number;
  hasLogin: boolean;
};

export function LoginsClientesPanel() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [yearMonth, setYearMonth] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editRow, setEditRow] = useState<LoginRow | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suporte/logins-clientes");
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: LoginRow[];
        yearMonth?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setRows(data.rows ?? []);
      setYearMonth(data.yearMonth ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.clienteNome.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        String(r.portalClienteId).includes(q),
    );
  }, [rows, busca]);

  const faltantes = useMemo(() => rows.filter((r) => !r.hasLogin).length, [rows]);
  const comLogin = useMemo(() => rows.filter((r) => r.hasLogin).length, [rows]);

  async function syncPlayerGateway(): Promise<{ clientes: number; pdvs: number } | null> {
    const res = await fetch("/api/player/sync-gateway", { method: "POST" });
    const data = (await res.json()) as {
      error?: string;
      clientes?: number;
      pdvs?: number;
    };
    if (!res.ok) return null;
    return { clientes: data.clientes ?? 0, pdvs: data.pdvs ?? 0 };
  }

  async function runGenerateBatches(onProgress: (detail: string) => void) {
    let offset = 0;
    let hasMore = true;
    let createdTotal = 0;
    let skippedTotal = 0;

    while (hasMore) {
      const res = await fetch("/api/suporte/logins-clientes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: false, offset }),
      });
      const data = (await res.json()) as {
        error?: string;
        created?: number;
        skipped?: number;
        total?: number;
        hasMore?: boolean;
        nextOffset?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "falhou");

      createdTotal += data.created ?? 0;
      skippedTotal += data.skipped ?? 0;
      hasMore = Boolean(data.hasMore);
      offset = data.nextOffset ?? offset;
      const total = data.total ?? 0;
      onProgress(`Gerando logins… ${Math.min(offset, total)}/${total || "…"}`);
    }

    const gateway = createdTotal > 0 ? await syncPlayerGateway() : null;
    return { createdTotal, skippedTotal, gateway };
  }

  async function gerarFaltantes() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const { createdTotal, skippedTotal, gateway } = await runGenerateBatches(setMsg);
      if (createdTotal === 0) {
        setMsg(
          `Nenhum login novo criado — ${skippedTotal} clientes já tinham credenciais (não alteradas).`,
        );
      } else {
        setMsg(
          `${createdTotal} login(s) criado(s). ${skippedTotal} já existiam e permanecem iguais.` +
            (gateway ?
              ` Player sincronizado: ${gateway.clientes} clientes.`
            : ""),
        );
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao gerar logins.");
    } finally {
      setBusy(false);
    }
  }

  async function runRegenerateEmailBatches(onProgress: (detail: string) => void) {
    let offset = 0;
    let hasMore = true;
    let updatedTotal = 0;
    let unchanged = 0;

    while (hasMore) {
      const res = await fetch("/api/suporte/logins-clientes/regenerate-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          sync: false,
          offset,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        updated?: number;
        unchanged?: number;
        total?: number;
        hasMore?: boolean;
        nextOffset?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "falhou");

      updatedTotal += data.updated ?? 0;
      unchanged = data.unchanged ?? unchanged;
      hasMore = Boolean(data.hasMore);
      offset = data.nextOffset ?? offset;
      const total = data.total ?? 0;
      onProgress(`Regerando e-mails… ${Math.min(offset, total)}/${total || "…"}`);
    }

    const gateway = updatedTotal > 0 ? await syncPlayerGateway() : null;
    return { updatedTotal, unchanged, gateway };
  }

  async function regerarEmailsCurto() {
    if (busy || comLogin === 0) return;
    const ok = window.confirm(
      `Regerar e-mails curtos de ${comLogin} login(s)?\n\n` +
        "As SENHAS permanecem iguais. Só o e-mail (login) muda.\n" +
        "Ex.: arefra@radioibiza.com.br\n\n" +
        "Depois sincroniza no Player 5. Continuar?",
    );
    if (!ok) return;

    setBusy(true);
    setMsg("");
    try {
      const { updatedTotal, unchanged, gateway } = await runRegenerateEmailBatches(setMsg);
      setMsg(
        `${updatedTotal} e-mail(s) atualizado(s). ${unchanged} já estavam no formato curto.` +
          (gateway ?
            ` Player sincronizado: ${gateway.clientes} clientes.`
          : ""),
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao regerar e-mails.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(r: LoginRow) {
    if (!r.hasLogin) return;
    setEditRow(r);
    setEditEmail(r.email);
    setEditPassword(r.password ?? r.suggestedPassword);
  }

  async function salvarEdicao() {
    if (!editRow || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `/api/suporte/logins-clientes/${editRow.portalClienteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: editEmail.trim(),
            password: editPassword.trim(),
            sync: true,
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "falhou");
      setMsg(`Login do cliente ${editRow.portalClienteId} atualizado manualmente.`);
      setEditRow(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  function copyCredenciais(r: LoginRow) {
    const senha = r.password ?? r.suggestedPassword;
    return `Login: ${r.email}\nSenha: ${senha}\nID cliente: ${r.portalClienteId}`;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Credenciais do <strong>Player</strong> para repassar ao cliente. Geradas <strong>uma vez</strong> e
        mantidas estáveis — o player precisa de login/senha fixos. Novos clientes recebem login automático;
        clientes existentes só ganham login pelo botão abaixo (faltantes) ou edição manual.
        {yearMonth != null ?
          <> · Planilha {formatYearMonthLabel(yearMonth)}.</>
        : null}
      </p>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
        E-mail curto: marca + variante (ex.{" "}
        <strong className="font-mono">arefra@radioibiza.com.br</strong>,{" "}
        <strong className="font-mono">arepro@radioibiza.com.br</strong>) — máx. 65 caracteres antes do{" "}
        <code className="rounded bg-white/60 px-1">@</code>. Senha: pedaço do nome + ID (ex.{" "}
        <strong className="font-mono">are100</strong>). Depois de criadas, senhas{" "}
        <strong>não mudam automaticamente</strong>.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente, e-mail ou ID…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          type="button"
          disabled={busy || faltantes === 0}
          onClick={() => void gerarFaltantes()}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {faltantes > 0 ?
            `Gerar logins faltantes (${faltantes})`
          : "Todos com login"}
        </button>
        <button
          type="button"
          disabled={busy || comLogin === 0}
          onClick={() => void regerarEmailsCurto()}
          className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
          title="Operação em massa — regera só o e-mail, mantém a senha"
        >
          Regerar e-mails curtos ({comLogin})
        </button>
      </div>

      {msg ?
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          {msg}
        </div>
      : null}

      {loading ?
        <p className="text-sm text-slate-400">Carregando…</p>
      : filtrados.length === 0 ?
        <p className="text-sm text-slate-400">
          {rows.length === 0 ?
            "Nenhum cliente com ID Player. Atribua IDs em Cadastros → IDs Player e depois gere os logins faltantes."
          : "Nenhum resultado para a busca."}
        </p>
      : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-center">ID</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">E-mail (login)</th>
                <th className="px-3 py-2">Senha</th>
                <th className="px-3 py-2 text-center">PDVs</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => {
                const senha = r.password ?? (r.hasLogin ? "—" : r.suggestedPassword);
                const pendente = !r.hasLogin;
                return (
                  <tr
                    key={r.portalClienteId}
                    className={`border-t border-slate-100 dark:border-slate-800 ${pendente ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}
                  >
                    <td className="px-3 py-2 text-center font-mono text-sky-700 dark:text-sky-400">
                      {r.portalClienteId}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.clienteNome}
                      {pendente ?
                        <span className="ml-1 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                          sem login
                        </span>
                      : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{r.email}</span>
                      {r.hasLogin ?
                        <CopyTextButton
                          size="compact"
                          variant="icon"
                          text={r.email}
                          label="Copiar e-mail"
                          className="ml-1 inline-flex align-middle"
                        />
                      : null}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-mono text-xs ${pendente ? "text-slate-400 italic" : ""}`}
                        title={pendente ? "Senha sugerida — ainda não gravada" : undefined}
                      >
                        {senha}
                      </span>
                      {r.hasLogin && r.password ?
                        <CopyTextButton
                          size="compact"
                          variant="icon"
                          text={r.password}
                          label="Copiar senha"
                          className="ml-1 inline-flex align-middle"
                        />
                      : null}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-slate-500">{r.pdvCount}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {r.hasLogin ?
                          <>
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-white dark:border-slate-600"
                              onClick={() => openEdit(r)}
                            >
                              Editar
                            </button>
                            <CopyTextButton
                              size="compact"
                              text={copyCredenciais(r)}
                              label="Copiar login + senha + ID"
                            />
                          </>
                        : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }

      {editRow ?
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-bold">Editar login — {editRow.clienteNome}</h3>
            <p className="mt-1 text-xs text-slate-500">
              ID {editRow.portalClienteId}. Alterações manuais substituem as credenciais no Player após
              sincronização.
            </p>
            <div className="mt-3 space-y-2">
              <label className="block text-xs">
                <span className="mb-0.5 block font-semibold text-slate-600">E-mail</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block font-semibold text-slate-600">Senha</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
                onClick={() => setEditRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void salvarEdicao()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      : null}
    </div>
  );
}
