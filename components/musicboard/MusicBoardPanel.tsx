"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MusicboardPeriodo } from "@/lib/musicboard/musicboardConfigService";
import type { MusicboardClienteListItem } from "@/lib/musicboard/musicboardDataService";
import { printRewindPdf } from "@/lib/musicboard/rewindTemplate";

type Tab = "enviar" | "admin";

type Status = { kind: "ok" | "err"; text: string } | null;

type AdminDraft = {
  enabled: boolean;
  emailsText: string;
  periodo: MusicboardPeriodo;
  depoimentoTexto: string;
  depoimentoAutor: string;
  narrativaCurador: string;
  dirty: boolean;
  saving: boolean;
};

const inputClass = "portal-input w-full";

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function mapErr(data: unknown): string {
  const err = (data as { error?: unknown })?.error;
  if (err === "unauthorized") return "Sessão expirada.";
  if (err === "cliente_invalido") return "Selecione um cliente válido.";
  if (err === "cliente_nao_encontrado") return "Cliente sem ID Player no layout.";
  if (err === "email_invalido") return "Cadastre ao menos um e-mail válido.";
  if (err === "smtp_nao_configurado") return "SMTP não configurado (OC_EMAIL_SMTP_*).";
  if (typeof err === "string" && err.trim()) return err;
  return "Operação falhou.";
}

function emailsToText(emails: string[]): string {
  return emails.join(", ");
}

function parseEmailsText(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function MusicBoardPanel() {
  const [tab, setTab] = useState<Tab>("enviar");
  const [clientes, setClientes] = useState<MusicboardClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [periodoPreview, setPeriodoPreview] = useState<MusicboardPeriodo>("6m");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendToOverride, setSendToOverride] = useState("");

  const [busca, setBusca] = useState("");
  const [adminDrafts, setAdminDrafts] = useState<Record<number, AdminDraft>>({});

  const loadClientes = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/musicboard/clientes", { credentials: "same-origin" });
      const data = (await res.json()) as { ok?: boolean; clientes?: MusicboardClienteListItem[] };
      if (!res.ok || !data.ok) throw new Error(mapErr(data));
      const list = Array.isArray(data.clientes) ? data.clientes : [];
      setClientes(list);

      setAdminDrafts((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (!next[c.portalClienteId]) {
            next[c.portalClienteId] = {
              enabled: c.enabled,
              emailsText: emailsToText(c.emails),
              periodo: c.periodo,
              depoimentoTexto: "",
              depoimentoAutor: "",
              narrativaCurador: "",
              dirty: false,
              saving: false,
            };
          }
        }
        return next;
      });
    } catch (e) {
      setClientes([]);
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Falha ao carregar." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClientes();
  }, [loadClientes]);

  const enabledClientes = useMemo(
    () => clientes.filter((c) => c.enabled),
    [clientes],
  );

  const clientesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = tab === "enviar" ? enabledClientes : clientes;
    if (!q) return base;
    return base.filter((c) =>
      [c.clienteNome, String(c.portalClienteId), c.emails.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [busca, clientes, enabledClientes, tab]);

  const selectedCliente = useMemo(
    () => clientes.find((c) => c.portalClienteId === selectedId) ?? null,
    [clientes, selectedId],
  );

  const loadPreview = useCallback(async (portalClienteId: number, periodo: MusicboardPeriodo) => {
    setPreviewLoading(true);
    setStatus(null);
    try {
      const qs = new URLSearchParams({
        portalClienteId: String(portalClienteId),
        period: periodo,
      });
      const res = await fetch(`/api/musicboard/preview?${qs}`, { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        html?: string;
        data?: { clienteNome?: string; periodoLabel?: string };
      };
      if (!res.ok || !data.ok || !data.html) throw new Error(mapErr(data));
      setPreviewHtml(data.html);
      const nome = data.data?.clienteNome ?? "Cliente";
      const label = data.data?.periodoLabel ?? "";
      setPreviewTitle(`REWIND — ${nome} · ${label}`);
    } catch (e) {
      setPreviewHtml(null);
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Preview falhou." });
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "enviar" || selectedId == null) return;
    void loadPreview(selectedId, periodoPreview);
  }, [tab, selectedId, periodoPreview, loadPreview]);

  useEffect(() => {
    if (selectedId == null && enabledClientes.length > 0) {
      setSelectedId(enabledClientes[0]!.portalClienteId);
    }
  }, [enabledClientes, selectedId]);

  async function handleSend() {
    if (selectedId == null) return;
    setSendLoading(true);
    setStatus(null);
    try {
      const to = parseEmailsText(sendToOverride);
      const res = await fetch("/api/musicboard/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          portalClienteId: selectedId,
          ...(to.length ? { to } : {}),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; enviadoPara?: string[] };
      if (!res.ok || !data.ok) throw new Error(mapErr(data));
      setStatus({
        kind: "ok",
        text: `Enviado para ${(data.enviadoPara ?? []).join(", ")}.`,
      });
      void loadClientes();
    } catch (e) {
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Envio falhou." });
    } finally {
      setSendLoading(false);
    }
  }

  function patchAdminDraft(portalClienteId: number, patch: Partial<AdminDraft>) {
    setAdminDrafts((prev) => {
      const cur = prev[portalClienteId];
      if (!cur) return prev;
      return {
        ...prev,
        [portalClienteId]: { ...cur, ...patch, dirty: true },
      };
    });
  }

  async function loadAdminDetail(portalClienteId: number) {
    try {
      const res = await fetch(`/api/musicboard/config?portalClienteId=${portalClienteId}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        config?: {
          enabled?: boolean;
          emails?: string[];
          periodo?: MusicboardPeriodo;
          depoimentoTexto?: string;
          depoimentoAutor?: string;
          narrativaCurador?: string;
        };
      };
      if (!res.ok || !data.ok) return;
      const cfg = data.config;
      if (!cfg) return;
      setAdminDrafts((prev) => ({
        ...prev,
        [portalClienteId]: {
          enabled: cfg.enabled ?? false,
          emailsText: emailsToText(cfg.emails ?? []),
          periodo: cfg.periodo === "3m" ? "3m" : "6m",
          depoimentoTexto: cfg.depoimentoTexto ?? "",
          depoimentoAutor: cfg.depoimentoAutor ?? "",
          narrativaCurador: cfg.narrativaCurador ?? "",
          dirty: false,
          saving: false,
        },
      }));
    } catch {
      /* best-effort */
    }
  }

  async function saveAdmin(portalClienteId: number) {
    const draft = adminDrafts[portalClienteId];
    if (!draft) return;
    patchAdminDraft(portalClienteId, { saving: true });
    setStatus(null);
    try {
      const res = await fetch("/api/musicboard/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          portalClienteId,
          enabled: draft.enabled,
          emails: parseEmailsText(draft.emailsText),
          periodo: draft.periodo,
          depoimentoTexto: draft.depoimentoTexto,
          depoimentoAutor: draft.depoimentoAutor,
          narrativaCurador: draft.narrativaCurador,
        }),
      });
      const data = await res.json();
      if (!res.ok || !(data as { ok?: boolean }).ok) throw new Error(mapErr(data));
      setAdminDrafts((prev) => ({
        ...prev,
        [portalClienteId]: { ...draft, dirty: false, saving: false },
      }));
      setStatus({ kind: "ok", text: "Configuração salva." });
      void loadClientes();
    } catch (e) {
      patchAdminDraft(portalClienteId, { saving: false });
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Salvar falhou." });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Moodboard musical <strong>REWIND</strong> — retrospectiva sonora trimestral ou semestral com
        capas (Deezer), faixas mais curtidas, números da operação e narrativa de curadoria. Ative
        clientes e cadastre e-mails de marketing na aba Administração.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`portal-btn ${tab === "enviar" ? "portal-btn--primary" : "portal-btn--secondary"}`}
          onClick={() => setTab("enviar")}
        >
          Enviar
        </button>
        <button
          type="button"
          className={`portal-btn ${tab === "admin" ? "portal-btn--primary" : "portal-btn--secondary"}`}
          onClick={() => setTab("admin")}
        >
          Administração
        </button>
      </div>

      {status ?
        <p
          className={`text-sm ${status.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
        >
          {status.text}
        </p>
      : null}

      {tab === "enviar" ?
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente ativo…"
              className={inputClass}
            />
            {loading ?
              <p className="text-sm text-slate-500">Carregando…</p>
            : enabledClientes.length === 0 ?
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Nenhum cliente ativo. Ative na aba Administração.
              </p>
            : <ul className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                {clientesFiltrados.map((c) => (
                  <li key={c.portalClienteId}>
                    <button
                      type="button"
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        selectedId === c.portalClienteId
                          ? "bg-fuchsia-100 font-medium text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-100"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setSelectedId(c.portalClienteId);
                        setSendToOverride(emailsToText(c.emails));
                        setPeriodoPreview(c.periodo);
                      }}
                    >
                      <span className="block">{c.clienteNome}</span>
                      <span className="text-xs text-slate-500">
                        ID {c.portalClienteId} · {c.pdvCount} PDV{c.pdvCount === 1 ? "" : "s"}
                        {c.ultimoEnvioEm ? ` · enviado ${fmtWhen(c.ultimoEnvioEm)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            }

            {selectedCliente ?
              <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Período do preview
                </label>
                <div className="flex gap-2">
                  {(["3m", "6m"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        periodoPreview === p
                          ? "bg-fuchsia-700 text-white"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                      onClick={() => setPeriodoPreview(p)}
                    >
                      {p === "3m" ? "3 meses" : "6 meses"}
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  E-mails (opcional — sobrescreve cadastro)
                </label>
                <input
                  type="text"
                  value={sendToOverride}
                  onChange={(e) => setSendToOverride(e.target.value)}
                  placeholder={emailsToText(selectedCliente.emails) || "marketing@cliente.com.br"}
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="portal-btn portal-btn--primary"
                    disabled={sendLoading || previewLoading || selectedId == null}
                    onClick={() => void handleSend()}
                  >
                    {sendLoading ? "Enviando…" : "Enviar e-mail"}
                  </button>
                  <button
                    type="button"
                    className="portal-btn portal-btn--secondary"
                    disabled={!previewHtml || previewLoading}
                    onClick={() => {
                      if (previewHtml) printRewindPdf(previewHtml, previewTitle);
                    }}
                  >
                    Salvar PDF
                  </button>
                  <button
                    type="button"
                    className="portal-btn portal-btn--secondary"
                    disabled={selectedId == null || previewLoading}
                    onClick={() => {
                      if (selectedId != null) void loadPreview(selectedId, periodoPreview);
                    }}
                  >
                    Atualizar preview
                  </button>
                </div>
              </div>
            : null}
          </div>

          <div className="min-h-[480px] rounded-xl border border-slate-200 bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-900">
            {previewLoading ?
              <p className="p-4 text-sm text-slate-500">Montando moodboard…</p>
            : previewHtml ?
              <iframe
                title="Preview REWIND"
                srcDoc={previewHtml}
                className="h-[720px] w-full rounded-lg border-0 bg-[#0D0B14]"
                sandbox="allow-same-origin"
              />
            : <p className="p-4 text-sm text-slate-500">Selecione um cliente para ver o preview.</p>}
          </div>
        </div>
      : <div className="space-y-3">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente…"
            className={inputClass}
          />
          {loading ?
            <p className="text-sm text-slate-500">Carregando…</p>
          : <div className="space-y-3">
              {clientesFiltrados.map((c) => {
                const draft = adminDrafts[c.portalClienteId];
                if (!draft) return null;
                return (
                  <details
                    key={c.portalClienteId}
                    className="rounded-lg border border-slate-200 dark:border-slate-700"
                    onToggle={(e) => {
                      if ((e.target as HTMLDetailsElement).open) {
                        void loadAdminDetail(c.portalClienteId);
                      }
                    }}
                  >
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      {c.clienteNome}{" "}
                      <span className="font-normal text-slate-500">
                        (ID {c.portalClienteId}) · {c.pdvCount} PDV{c.pdvCount === 1 ? "" : "s"}
                        {c.enabled ? " · ativo" : ""}
                      </span>
                    </summary>
                    <div className="space-y-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(e) =>
                            patchAdminDraft(c.portalClienteId, { enabled: e.target.checked })
                          }
                        />
                        Recebe MusicBoard REWIND
                      </label>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                          E-mails (marketing)
                        </label>
                        <input
                          type="text"
                          value={draft.emailsText}
                          onChange={(e) =>
                            patchAdminDraft(c.portalClienteId, { emailsText: e.target.value })
                          }
                          placeholder="pessoa@marca.com.br, outro@marca.com.br"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                          Período padrão
                        </label>
                        <select
                          value={draft.periodo}
                          onChange={(e) =>
                            patchAdminDraft(c.portalClienteId, {
                              periodo: e.target.value === "3m" ? "3m" : "6m",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="3m">3 meses</option>
                          <option value="6m">6 meses</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                          Depoimento (opcional)
                        </label>
                        <textarea
                          value={draft.depoimentoTexto}
                          onChange={(e) =>
                            patchAdminDraft(c.portalClienteId, { depoimentoTexto: e.target.value })
                          }
                          rows={2}
                          className={inputClass}
                          placeholder="Feedback da loja ou equipe…"
                        />
                        <input
                          type="text"
                          value={draft.depoimentoAutor}
                          onChange={(e) =>
                            patchAdminDraft(c.portalClienteId, { depoimentoAutor: e.target.value })
                          }
                          placeholder="Nome · Loja / Unidade"
                          className={`${inputClass} mt-2`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                          Narrativa do curador (opcional)
                        </label>
                        <textarea
                          value={draft.narrativaCurador}
                          onChange={(e) =>
                            patchAdminDraft(c.portalClienteId, { narrativaCurador: e.target.value })
                          }
                          rows={3}
                          className={inputClass}
                          placeholder="2–3 linhas sobre o mood do período…"
                        />
                      </div>
                      <button
                        type="button"
                        className="portal-btn portal-btn--primary"
                        disabled={!draft.dirty || draft.saving}
                        onClick={() => void saveAdmin(c.portalClienteId)}
                      >
                        {draft.saving ? "Salvando…" : "Salvar"}
                      </button>
                    </div>
                  </details>
                );
              })}
            </div>
          }
        </div>
      }
    </div>
  );
}
