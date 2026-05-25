"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConsultaPainelDialog } from "@/components/ConsultaPainelDialog";
import { CopyTextButton } from "@/components/CopyTextButton";
import { COMPANY_NAME } from "@/lib/brand";
import { defaultPeriodMonths, formatBrazilianTaxId, formatBRL, parseEmailAddresses } from "@/lib/format";
import { readJsonFromResponse } from "@/lib/safeHttpJson";
import type { ClientRow } from "@/lib/types";

import { composePersistClienteNote } from "@/lib/portalClienteNote";

type ConnStatus = {
  connected: boolean;
  expiresAt?: string;
  error?: string;
};

type ClientSortMode = "parcelas_desc" | "open_desc" | "open_asc";

export function CobrancaDashboard() {
  const initial = defaultPeriodMonths(6);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [status, setStatus] = useState<ConnStatus | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sortClientsBy, setSortClientsBy] = useState<ClientSortMode>("parcelas_desc");
  const [cobEmailTpl, setCobEmailTpl] = useState({ subject: "", bodyText: "", loaded: false });
  const [cobEmailTplOpen, setCobEmailTplOpen] = useState(false);
  const [cobEmailTplSaving, setCobEmailTplSaving] = useState(false);
  const [smtpCobOpenCharges, setSmtpCobOpenCharges] = useState(false);
  const [sendingCobEmailClientId, setSendingCobEmailClientId] = useState<string | null>(null);
  const [cobSendModalOpen, setCobSendModalOpen] = useState(false);
  const [cobSendPreviewLoading, setCobSendPreviewLoading] = useState(false);
  const [cobSendClient, setCobSendClient] = useState<ClientRow | null>(null);
  const [cobSendSubject, setCobSendSubject] = useState("");
  const [cobSendBody, setCobSendBody] = useState("");
  const [cobSendEmailRaw, setCobSendEmailRaw] = useState("");
  const [cobSendPdfCount, setCobSendPdfCount] = useState(0);
  const [cobSendHadGaps, setCobSendHadGaps] = useState(false);
  const [cobSendHtmlPreview, setCobSendHtmlPreview] = useState("");
  /** Invalida merges de contratos quando período / refresh mudam antes da API responder. */
  const receivablesLoadGenRef = useRef(0);
  /** Observações: última versão confirmada pela API neste navegador (por cliente). */
  const lastPersistedNotesRef = useRef<Record<string, string>>({});
  /** Valor ao ganhar foco — usado para carimbar só o texto acrescentado em cada sessão. */
  const snapshotOnFocusNoteRef = useRef<Record<string, string>>({});
  const dirtyNoteIdsRef = useRef<Set<string>>(new Set());
  const clientsLatestRef = useRef<ClientRow[]>([]);

  useEffect(() => {
    clientsLatestRef.current = clients;
  }, [clients]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalOpenOf = useCallback((c: ClientRow) => c.sales.reduce((s, x) => s + x.value, 0), []);

  const sortedClients = useMemo(() => {
    const list = [...clients];
    const t = totalOpenOf;
    if (sortClientsBy === "parcelas_desc") {
      list.sort((a, b) => {
        const n = b.sales.length - a.sales.length;
        return n !== 0 ? n : t(b) - t(a);
      });
    } else if (sortClientsBy === "open_desc") {
      list.sort((a, b) => {
        const n = t(b) - t(a);
        return n !== 0 ? n : b.sales.length - a.sales.length;
      });
    } else {
      list.sort((a, b) => {
        const n = t(a) - t(b);
        return n !== 0 ? n : b.sales.length - a.sales.length;
      });
    }
    return list;
  }, [clients, sortClientsBy, totalOpenOf]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/contaazul/status", { credentials: "include" });
      const { data, parseError, rawText, ok } = await readJsonFromResponse<ConnStatus>(res);
      if (parseError || !data) {
        setStatus({
          connected: false,
          error: rawText.trim().slice(0, 240) || "Resposta inválida ao consultar status.",
        });
        return;
      }
      if (!ok && !("connected" in data)) {
        setStatus({ connected: false, error: `Erro ${res.status}` });
        return;
      }
      setStatus(data);
    } catch {
      setStatus({ connected: false, error: "Falha ao consultar status." });
    }
  }, []);

  const loadReceivables = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const loadGen = ++receivablesLoadGenRef.current;
    try {
      const q = new URLSearchParams({ start, end });
      const res = await fetch(`/api/contaazul/receivables?${q}`, {
        credentials: "include",
      });
      const { data, parseError, rawText } = await readJsonFromResponse<{
        clients?: ClientRow[];
        error?: string;
      }>(res);

      if (parseError || !data) {
        setClients([]);
        setFetchError(
          rawText.trim().slice(0, 220) ||
            `Erro ${res.status}: resposta não é JSON (pode ser falha do servidor ou timeout no deploy).`,
        );
        return;
      }

      if (!res.ok) {
        if (res.status === 401) {
          setClients([]);
          setFetchError(null);
          await loadStatus();
          setLoading(false);
          return;
        }
        throw new Error(data.error || `Erro ${res.status}`);
      }
      const list = data.clients ?? [];
      setClients(list);
      setLastRefresh(new Date());

      if (list.length > 0) {
        void (async () => {
          const ids = list.map((c) => c.id);
          /** Mesmo limite que `MAX_IDS` em `/api/contaazul/contracts-for-clients` */
          const CONTRACT_CLIENT_IDS_BATCH = 400;

          const notesPromise = fetch("/api/clients/notes-for", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientIds: ids }),
          });

          const mergedByClientId: Record<string, string> = {};
          for (let off = 0; off < ids.length; off += CONTRACT_CLIENT_IDS_BATCH) {
            const slice = ids.slice(off, off + CONTRACT_CLIENT_IDS_BATCH);
            const rContracts = await fetch("/api/contaazul/contracts-for-clients", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientIds: slice }),
            });
            if (loadGen !== receivablesLoadGenRef.current) return;
            const pC = await readJsonFromResponse<{
              byClientId?: Record<string, string>;
              error?: string;
            }>(rContracts);
            if (loadGen !== receivablesLoadGenRef.current) return;
            if (rContracts.ok && !pC.parseError && pC.data?.byClientId) {
              Object.assign(mergedByClientId, pC.data.byClientId);
            }
          }

          const rNotes = await notesPromise;
          if (loadGen !== receivablesLoadGenRef.current) return;
          const pN = await readJsonFromResponse<{ byId?: Record<string, string>; error?: string }>(
            rNotes,
          );
          if (loadGen !== receivablesLoadGenRef.current) return;

          const mapC =
            Object.keys(mergedByClientId).length > 0 ? mergedByClientId : null;
          const mapN = rNotes.ok && !pN.parseError && pN.data?.byId ? pN.data.byId : null;

          if (mapN) {
            for (const id of ids) {
              /** Sem linha na tabela ⇒ nota vazia. */
              lastPersistedNotesRef.current[id] = mapN[id] ?? "";
            }
          }

          if (!mapC && !mapN) return;

          setClients((prev) =>
            prev.map((c) => ({
              ...c,
              activeContractNumbers:
                mapC != null ? (mapC[c.id] ?? c.activeContractNumbers) : c.activeContractNumbers,
              note: mapN != null ? (mapN[c.id] ?? c.note) : c.note,
            })),
          );
        })();
      }
    } catch (e) {
      setClients([]);
      setFetchError(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [start, end, loadStatus]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadStatus();
    });
  }, [loadStatus]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("connected");
    const err = sp.get("oauth_error");
    queueMicrotask(() => {
      if (c === "1") {
        setOauthBanner("Conta Azul conectada com sucesso.");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (err) {
        setOauthBanner(`OAuth: ${decodeURIComponent(err)}`);
        window.history.replaceState({}, "", window.location.pathname);
      }
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (status?.connected) {
        void loadReceivables();
      } else {
        setClients([]);
      }
    });
  }, [status?.connected, loadReceivables]);

  const onRefresh = useCallback(() => {
    void (async () => {
      await loadStatus();
      await loadReceivables();
    })();
  }, [loadStatus, loadReceivables]);

  const onDefaultPeriod = useCallback(() => {
    const p = defaultPeriodMonths(6);
    setStart(p.start);
    setEnd(p.end);
  }, []);

  const onDisconnect = useCallback(async () => {
    await fetch("/api/contaazul/disconnect", { method: "POST" });
    setClients([]);
    setOauthBanner(null);
    await loadStatus();
  }, [loadStatus]);

  const onPortalLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  const openParcelaLink = useCallback((parcelaId: string, tipo: "boleto" | "nf") => {
    setActionMsg(null);
    const path = `/api/contaazul/parcela/${encodeURIComponent(parcelaId)}/file?tipo=${tipo}`;
    window.open(path, "_blank", "noopener,noreferrer");
  }, []);

  const persistCobEmailTemplate = useCallback(async () => {
    if (!cobEmailTpl.subject.trim() || !cobEmailTpl.bodyText.trim()) {
      setActionMsg("Preencha assunto e corpo do modelo de cobrança em aberto.");
      return;
    }
    setCobEmailTplSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/cobranca-aberta/email-template", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: cobEmailTpl.subject, bodyText: cobEmailTpl.bodyText }),
      });
      const { data, rawText } = await readJsonFromResponse<{
        ok?: boolean;
        error?: string;
        smtpConfigured?: boolean;
      }>(res);
      if (!res.ok || !data?.ok) {
        setActionMsg(data?.error || rawText.slice(0, 160) || "Não gravou o modelo.");
        return;
      }
      setSmtpCobOpenCharges(Boolean(data.smtpConfigured));
      setActionMsg("Modelo «cobranças em aberto» gravado.");
    } finally {
      setCobEmailTplSaving(false);
    }
  }, [cobEmailTpl.subject, cobEmailTpl.bodyText]);

  const closeCobSendModal = useCallback(() => {
    setCobSendModalOpen(false);
    setCobSendPreviewLoading(false);
    setCobSendClient(null);
    setCobSendSubject("");
    setCobSendBody("");
    setCobSendEmailRaw("");
    setCobSendPdfCount(0);
    setCobSendHadGaps(false);
    setCobSendHtmlPreview("");
  }, []);

  const openCobChargesEmailComposer = useCallback(
    async (c: ClientRow) => {
      const dest = parseEmailAddresses(c.email === "—" ? "" : c.email);
      if (!dest.length) {
        setActionMsg(
          "Não há e-mail de cobrança/faturamento nem principal válido neste cadastro Conta Azul.",
        );
        return;
      }
      if (!smtpCobOpenCharges) {
        setActionMsg(
          "Configure SMTP (variáveis OC_EMAIL_SMTP_* e OC_EMAIL_FROM) — igual ao envio OC em /manual.",
        );
        return;
      }
      setCobSendModalOpen(true);
      setCobSendPreviewLoading(true);
      setCobSendClient(c);
      setCobSendEmailRaw(c.email === "—" ? "" : c.email);
      setActionMsg(null);
      try {
        const res = await fetch("/api/cobranca-aberta/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: c.id,
            fantasy: c.fantasy,
            cnpj: c.cnpj === "—" ? "" : c.cnpj,
            emailRaw: c.email === "—" ? "" : c.email,
            sales: c.sales,
          }),
        });
        const { data, rawText } = await readJsonFromResponse<{
          ok?: boolean;
          subject?: string;
          bodyPlain?: string;
          htmlPreview?: string;
          pdfAttachments?: number;
          hadAttachmentGaps?: boolean;
          error?: string;
        }>(res);
        if (!res.ok || !data?.ok) {
          setActionMsg(data?.error || rawText.slice(0, 220) || "Falha ao montar pré-visualização.");
          closeCobSendModal();
          return;
        }
        setCobSendSubject(data.subject ?? "");
        setCobSendBody(data.bodyPlain ?? "");
        setCobSendPdfCount(data.pdfAttachments ?? 0);
        setCobSendHadGaps(Boolean(data.hadAttachmentGaps));
        setCobSendHtmlPreview(data.htmlPreview ?? "");
      } catch {
        setActionMsg("Falha de rede ao pedir pré-visualização.");
        closeCobSendModal();
      } finally {
        setCobSendPreviewLoading(false);
      }
    },
    [closeCobSendModal, smtpCobOpenCharges],
  );

  const confirmCobChargesEmailSend = useCallback(async () => {
    const c = cobSendClient;
    if (!c) return;

    const to = parseEmailAddresses(cobSendEmailRaw.trim());
    if (!to.length) {
      setActionMsg("Introduza pelo menos um e-mail válido em «Para».");
      return;
    }
    if (!cobSendSubject.trim()) {
      setActionMsg("Introduza o assunto.");
      return;
    }

    setSendingCobEmailClientId(c.id);
    setActionMsg(null);
    try {
      const res = await fetch("/api/cobranca-aberta/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: c.id,
          fantasy: c.fantasy,
          cnpj: c.cnpj === "—" ? "" : c.cnpj,
          emailRaw: cobSendEmailRaw.trim(),
          subject: cobSendSubject.trim(),
          bodyPlain: cobSendBody,
          sales: c.sales,
        }),
      });
      const { data, rawText } = await readJsonFromResponse<{
        ok?: boolean;
        pdfAttachments?: number;
        hadAttachmentGaps?: boolean;
        recipients?: string[];
        error?: string;
      }>(res);
      if (!res.ok || !data?.ok) {
        setActionMsg(data?.error || rawText.slice(0, 220) || "Falha ao enviar e-mail.");
        return;
      }
      let msg =
        `Enviado para ${data.recipients?.join(", ") ?? "?"} — ${data.pdfAttachments ?? 0} PDF(s) em anexo.`;
      if (data.hadAttachmentGaps) msg += " (Algum PDF não ficou disponível aqui para anexar.)";
      setActionMsg(msg);
      closeCobSendModal();
    } finally {
      setSendingCobEmailClientId(null);
    }
  }, [
    cobSendBody,
    cobSendClient,
    cobSendEmailRaw,
    cobSendSubject,
    closeCobSendModal,
  ]);

  const persistClientMetaNote = useCallback(
    async (clientId: string, noteFull: string, opts?: { keepalive?: boolean }) => {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ note: noteFull }),
          keepalive: opts?.keepalive ?? false,
        });
        if (!res.ok) {
          setActionMsg("Não foi possível salvar dados do cliente.");
          return false;
        }
        const parsed = await readJsonFromResponse<{ note?: string }>(res);
        if (parsed.parseError || !parsed.data || typeof parsed.data.note !== "string") {
          setActionMsg("Resposta inválida ao salvar (servidor não enviou JSON).");
          return false;
        }
        const note = parsed.data.note;
        lastPersistedNotesRef.current[clientId] = note;
        dirtyNoteIdsRef.current.delete(clientId);
        setActionMsg(null);
        setClients((prev) =>
          prev.map((c) =>
            c.id === clientId ? { ...c, note } : c,
          ),
        );
        return true;
      } catch {
        setActionMsg("Falha ao salvar. Verifique a conexão.");
        return false;
      }
    },
    [],
  );

  const flushClientNoteDraft = useCallback(
    async (clientId: string, draft: string, opts?: { keepalive?: boolean }) => {
      const last = lastPersistedNotesRef.current[clientId] ?? "";
      const snap = snapshotOnFocusNoteRef.current[clientId];
      const composed = composePersistClienteNote({
        lastPersisted: last,
        snapshotOnFocus: typeof snap === "string" ? snap : undefined,
        draft,
      });
      if (composed.action === "skip") {
        dirtyNoteIdsRef.current.delete(clientId);
        return;
      }

      await persistClientMetaNote(clientId, composed.note, opts);
    },
    [persistClientMetaNote],
  );

  useEffect(() => {
    const flushDirtyNotes = () => {
      const list = clientsLatestRef.current;
      for (const id of [...dirtyNoteIdsRef.current]) {
        const row = list.find((x) => x.id === id);
        if (!row) continue;
        void flushClientNoteDraft(id, row.note, { keepalive: true });
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flushDirtyNotes();
      }
    };
    window.addEventListener("pagehide", flushDirtyNotes);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flushDirtyNotes);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushClientNoteDraft]);

  useEffect(() => {
    const ok = Boolean(status?.connected);
    if (!ok) return;
    let canceled = false;
    void (async () => {
      const res = await fetch("/api/cobranca-aberta/email-template", { credentials: "include" });
      const { data, parseError } = await readJsonFromResponse<{
        subject?: string;
        bodyText?: string;
        smtpConfigured?: boolean;
      }>(res);
      if (canceled || parseError || !data) return;
      setSmtpCobOpenCharges(Boolean(data.smtpConfigured));
      if (typeof data.subject === "string" && typeof data.bodyText === "string") {
        setCobEmailTpl({ subject: data.subject, bodyText: data.bodyText, loaded: true });
      }
    })();
    return () => {
      canceled = true;
    };
  }, [status?.connected]);

  const connected = Boolean(status?.connected);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {oauthBanner ? (
        <div
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
          role="status"
        >
          {oauthBanner}
        </div>
      ) : null}

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0066cc] dark:text-sky-400">
            {COMPANY_NAME}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cobrança — parcelas vencidas em aberto
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Ordenação ajustável: mais parcelas vencidas, ou maior / menor valor total em aberto por
            cliente — coluna «E-mail»: cobrança/faturamento + principal/outros na API, sem repetir destinatários. Envios
            SMTP levam sempre <strong>Cc cobranca@radioibiza.com.br</strong> (configurável).
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            Período (vencimento): {start} a {end}. Apenas parcelas com vencimento{" "}
            <strong>antes de hoje</strong> e valor em aberto.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ThemeToggle />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {connected ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
                  aria-hidden
                />
                Conectado ao Conta Azul
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Não conectado
              </span>
            )}
            {connected ? (
              <a
                href="/api/contaazul/login"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Reautorizar
              </a>
            ) : (
              <a
                href="/api/contaazul/login"
                className="rounded-lg bg-[#0066cc] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 dark:bg-sky-600"
              >
                Conectar Conta Azul
              </a>
            )}
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              className="rounded-lg bg-[#0066cc] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 dark:bg-sky-600"
            >
              {loading ? "Carregando…" : "Atualizar"}
            </button>
            {connected ? (
              <button
                type="button"
                onClick={() => void onDisconnect()}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Desconectar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onPortalLogout()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sair do portal
            </button>
          </div>
        </div>
      </header>

      {status?.error && !status.connected ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Banco / configuração: {status.error}. Verifique{" "}
          <code className="rounded bg-white/50 px-1 dark:bg-black/30">DATABASE_URL</code> na
          Netlify.
        </p>
      ) : null}

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-500">
        {lastRefresh
          ? `Última atualização: ${lastRefresh.toLocaleString("pt-BR")}`
          : "Nenhuma atualização ainda."}
        {status?.expiresAt
          ? ` · Token válido até ~ ${new Date(status.expiresAt).toLocaleString("pt-BR")}`
          : null}
      </p>

      {fetchError ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {fetchError}
        </p>
      ) : null}

      {actionMsg ? (
        <p
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
          role="status"
        >
          {actionMsg}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="d0"
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
          >
            Período — início
          </label>
          <input
            id="d0"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label
            htmlFor="d1"
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
          >
            Período — fim
          </label>
          <input
            id="d1"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={onDefaultPeriod}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Últimos 6 meses (padrão)
        </button>
        <div>
          <label
            htmlFor="sort_clients"
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
          >
            Ordenar clientes
          </label>
          <select
            id="sort_clients"
            value={sortClientsBy}
            onChange={(e) => setSortClientsBy(e.target.value as ClientSortMode)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="parcelas_desc">Mais parcelas vencidas primeiro</option>
            <option value="open_desc">Total em aberto — maior → menor</option>
            <option value="open_asc">Total em aberto — menor → maior</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <a
            href="/prototype.html"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0066cc] hover:bg-slate-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-slate-900"
          >
            Ver protótipo HTML
          </a>
          <Link
            href="/manual"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Envios manuais (OC)
          </Link>
          <Link
            href="/planilha-rio"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Planilha Rio
          </Link>
          <ConsultaPainelDialog />
        </div>
      </div>

      {connected ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={() => setCobEmailTplOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left font-semibold text-slate-800 dark:text-slate-100"
          >
            <span>E-mail agregado — cobranças em aberto (mesmo SMTP que «Envios manuais»)</span>
            <span className="text-[0.65rem] text-slate-500">{cobEmailTplOpen ? "▴" : "▾"}</span>
          </button>
          <p className="mt-1 text-[0.65rem] leading-snug text-slate-600 dark:text-slate-400">
            Placeholders no corpo do e-mail:{" "}
            <code className="rounded bg-white/80 px-0.5 dark:bg-slate-800">{"{{CLIENTE}}"}</code>,{" "}
            <code className="rounded bg-white/80 px-0.5 dark:bg-slate-800">{"{{CNPJ}}"}</code>,{" "}
            <code className="rounded bg-white/80 px-0.5 dark:bg-slate-800">
              {"{{TABELA_PARCELAS}}"}
            </code>
            ,{" "}
            <code className="rounded bg-white/80 px-0.5 dark:bg-slate-800">{"{{TOTAL}}"}</code>,{" "}
            <code className="rounded bg-white/80 px-0.5 dark:bg-slate-800">{"{{DOCUMENTOS}}"}</code>,{" "}
            <code className="rounded bg-white/80 px-0.5 dark:bg-slate-800">{"{{MARCA}}"}</code>.
            Boletos novos (Conta Azul / iugu) tentam ir em PDF nos anexos; se faltar algum, aparece um aviso na revisão antes de enviar.
          </p>
          {cobEmailTplOpen ? (
            <div className="mt-2 space-y-2">
              <div>
                <label className="mb-0.5 block text-[0.6rem] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Assunto
                </label>
                <input
                  value={cobEmailTpl.subject}
                  onChange={(e) =>
                    setCobEmailTpl((p) => ({ ...p, subject: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[0.6rem] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Corpo (texto)
                </label>
                <textarea
                  value={cobEmailTpl.bodyText}
                  onChange={(e) =>
                    setCobEmailTpl((p) => ({ ...p, bodyText: e.target.value }))
                  }
                  rows={10}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[0.7rem] leading-relaxed dark:border-slate-600 dark:bg-slate-950"
                />
              </div>
              <button
                type="button"
                disabled={cobEmailTplSaving}
                onClick={() => void persistCobEmailTemplate()}
                className="rounded-lg bg-[#0066cc] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 dark:bg-sky-600"
              >
                {cobEmailTplSaving ? "Salvando…" : "Salvar modelo"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          {connected
            ? "Clique no nome do cliente para ver as parcelas e abrir boleto ou nota. Observações internas ficam à direita; o texto segue gravado mesmo que o cliente deixe a listagem. Ao tirar o foco ou fechar a aba/site, novo trecho pode ser registado automaticamente com data e horário (Horário Brasília)."
            : "Conecte o Conta Azul para carregar receitas. Cadastre OAuth e Postgres nas variáveis de ambiente."}
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">
                  Nome fantasia
                </th>
                <th className="border-b border-slate-200 px-2 py-2 whitespace-nowrap dark:border-slate-700">
                  CNPJ
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap dark:border-slate-700">
                  Nº vendas
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap dark:border-slate-700">
                  Total aberto
                </th>
                <th className="border-b border-slate-200 px-2 py-2 min-w-[12rem] dark:border-slate-700">
                  E-mail
                </th>
                <th className="border-b border-slate-200 px-2 py-2 whitespace-nowrap dark:border-slate-700">
                  Contrato ativo
                </th>
                <th className="sticky right-0 z-20 min-w-[24rem] max-w-[32rem] border-b border-l border-slate-200 bg-slate-50 px-2 py-2 shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.12)] dark:border-slate-600 dark:bg-slate-800 dark:shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.35)]">
                  Observação
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="border-b border-slate-200/90 px-4 py-8 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400"
                  >
                    {connected
                      ? "Nenhum cliente com parcelas vencidas em aberto nesse período."
                      : "Clique em “Conectar Conta Azul” para autorizar o acesso."}
                  </td>
                </tr>
              ) : null}
              {sortedClients.map((c, clientIndex) => {
                const total = totalOpenOf(c);
                const open = expanded.has(c.id);
                const stripe =
                  clientIndex % 2 === 0
                    ? "bg-white dark:bg-slate-900"
                    : "bg-slate-100 dark:bg-slate-800";
                const zebraExpand =
                  clientIndex % 2 === 0
                    ? "bg-slate-50/95 dark:bg-slate-950/50"
                    : "bg-slate-200/80 dark:bg-slate-800/90";
                const stickyObs = `sticky right-0 z-10 min-w-[24rem] max-w-[32rem] border-b border-l border-slate-200 shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.1)] dark:border-slate-600 dark:shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.3)] ${stripe}`;
                const noteLineCount = c.note.trim()
                  ? Math.min(4, Math.max(1, c.note.split(/\r?\n/).length))
                  : 1;
                const canSendCobEmail =
                  smtpCobOpenCharges &&
                  parseEmailAddresses(c.email === "—" ? "" : c.email).length > 0 &&
                  c.sales.length > 0;

                return (
                  <Fragment key={c.id}>
                    <tr className={`align-top ${stripe}`}>
                      <td
                        className="max-w-[12rem] border-b border-slate-200/90 px-2 py-1.5 align-middle dark:border-slate-800"
                        title={c.fantasy}
                      >
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => toggle(c.id)}
                            aria-expanded={open}
                            className="min-w-0 flex-1 text-left font-semibold text-[#0066cc] underline decoration-[#0066cc]/40 underline-offset-2 hover:decoration-[#0066cc] dark:text-sky-400 dark:decoration-sky-400/40"
                          >
                            <span className="line-clamp-2">{c.fantasy}</span>
                            <span className="ml-1 text-[0.55rem] font-normal text-slate-500 no-underline dark:text-slate-400">
                              {open ? "▴" : "▾"}
                            </span>
                          </button>
                          <CopyTextButton text={c.fantasy} label={`Copiar nome fantasia (${c.fantasy})`} />
                        </div>
                      </td>
                      <td className="border-b border-slate-200/90 px-2 py-1.5 align-middle dark:border-slate-800">
                        <div className="flex min-w-0 flex-nowrap items-center gap-0.5">
                          <span className="min-w-0 truncate tabular-nums text-slate-700 dark:text-slate-300">
                            {formatBrazilianTaxId(c.cnpj)}
                          </span>
                          {c.cnpj !== "—" ? (
                            <CopyTextButton
                              text={formatBrazilianTaxId(c.cnpj)}
                              label="Copiar CNPJ ou CPF"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="border-b border-slate-200/90 px-2 py-1.5 text-right align-middle tabular-nums text-slate-900 dark:border-slate-800 dark:text-slate-100">
                        {c.sales.length}
                      </td>
                      <td className="border-b border-slate-200/90 px-2 py-1.5 text-right align-middle tabular-nums font-medium text-slate-900 dark:border-slate-800 dark:text-slate-100">
                        {formatBRL(total)}
                      </td>
                      <td
                        className="min-w-[11rem] max-w-[17rem] border-b border-slate-200/90 px-2 py-1.5 align-middle dark:border-slate-800"
                      >
                        {(() => {
                          const emails = parseEmailAddresses(
                            c.email === "—" ? "" : c.email,
                          );
                          const joined = emails.join("\n");
                          if (emails.length === 0) {
                            return (
                              <span className="text-[0.65rem] text-slate-400">—</span>
                            );
                          }
                          return (
                            <div className="flex min-w-0 items-start gap-0.5 break-all text-[0.65rem] leading-snug">
                              <ul className="min-w-0 flex-1 list-none space-y-0.5">
                                {emails.map((em) => (
                                  <li key={em}>
                                    <a
                                      href={`mailto:${em}`}
                                      className="text-[#0066cc] hover:underline dark:text-sky-400"
                                      title={em}
                                    >
                                      {em}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                              <CopyTextButton
                                text={joined}
                                label="Copiar todos os e-mails deste cliente"
                              />
                            </div>
                          );
                        })()}
                      </td>
                      <td className="border-b border-slate-200/90 px-2 py-1.5 align-middle text-[0.65rem] dark:border-slate-800">
                        {c.activeContractNumbers ? (
                          <span
                            className="font-semibold text-emerald-700 dark:text-emerald-400"
                            title={`Contrato(s) ativo(s) na Conta Azul: ${c.activeContractNumbers}`}
                          >
                            {c.activeContractNumbers}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`px-2 py-1.5 align-top ${stickyObs}`}>
                        <textarea
                          rows={noteLineCount}
                          value={c.note}
                          onFocus={(e) => {
                            snapshotOnFocusNoteRef.current[c.id] = e.target.value;
                          }}
                          onChange={(e) => {
                            dirtyNoteIdsRef.current.add(c.id);
                            const v = e.target.value;
                            setClients((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, note: v } : x,
                              ),
                            );
                          }}
                          onBlur={(e) => void flushClientNoteDraft(c.id, e.target.value)}
                          placeholder="Histórico interno. Acrescentou texto desde que clicou no campo? Ao sair, pode ser criada uma linha com data/hora."
                          className="box-border w-full max-h-24 max-w-full resize-y overflow-y-auto rounded border border-slate-300 bg-inherit px-1.5 py-0.5 text-[0.65rem] leading-tight text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
                          autoComplete="off"
                          spellCheck="false"
                        />
                      </td>
                    </tr>
                    {open ? (
                      <tr className={zebraExpand}>
                        <td
                          colSpan={7}
                          className="border-b border-slate-200/90 px-2 py-2 dark:border-slate-800"
                        >
                          <p className="mb-1.5 text-[0.65rem] font-medium text-slate-600 dark:text-slate-400">
                            Parcelas em aberto — {c.fantasy}
                          </p>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={
                                !canSendCobEmail ||
                                sendingCobEmailClientId === c.id ||
                                (cobSendModalOpen &&
                                  cobSendPreviewLoading &&
                                  cobSendClient?.id === c.id)
                              }
                              onClick={() => void openCobChargesEmailComposer(c)}
                              className="rounded-lg border border-violet-600 bg-violet-50 px-3 py-1.5 text-[0.65rem] font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-900/50"
                              title={
                                !smtpCobOpenCharges
                                  ? "Configure OC_EMAIL_SMTP_* e OC_EMAIL_FROM"
                                  : "Revisar texto e destinatários, depois enviar um único e-mail com anexos"
                              }
                            >
                              {sendingCobEmailClientId === c.id
                                ? "A enviar…"
                                : "Revisar e enviar e-mail"}
                            </button>
                            {!smtpCobOpenCharges ? (
                              <span className="text-[0.6rem] text-amber-800 dark:text-amber-200">
                                SMTP não configurado (env{" "}
                                <code className="rounded bg-amber-100/80 px-0.5 dark:bg-amber-950/60">
                                  OC_EMAIL_*
                                </code>
                                ).
                              </span>
                            ) : null}
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                            <table className="w-full min-w-[640px] text-[0.65rem]">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-100 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  <th className="px-2 py-1">Competência</th>
                                  <th className="px-2 py-1">Vencimento</th>
                                  <th className="min-w-[12rem] px-2 py-1">Resumo</th>
                                  <th className="px-2 py-1 text-right">Valor</th>
                                  <th className="whitespace-nowrap px-2 py-1">Boleto / NF</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.sales.map((s, si) => {
                                  const sub =
                                    si % 2 === 0
                                      ? "bg-white dark:bg-slate-900/80"
                                      : "bg-slate-50 dark:bg-slate-800/60";
                                  return (
                                    <tr
                                      key={`${c.id}-${s.id}-${si}`}
                                      className={`border-b border-slate-100 dark:border-slate-700 ${sub}`}
                                    >
                                      <td className="whitespace-nowrap px-2 py-1 align-middle text-slate-800 dark:text-slate-200">
                                        {s.comp}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1 align-middle text-slate-800 dark:text-slate-200">
                                        {s.due}
                                      </td>
                                      <td className="max-w-[24rem] px-2 py-1 align-middle leading-snug text-slate-800 dark:text-slate-200">
                                        {s.summary}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1 text-right align-middle tabular-nums font-medium text-slate-900 dark:text-slate-100">
                                        {formatBRL(s.value)}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1 align-middle">
                                        <div className="flex flex-wrap gap-1">
                                          <button
                                            type="button"
                                            onClick={() => openParcelaLink(s.id, "boleto")}
                                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[0.65rem] font-semibold hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                                            title="Boleto ou link de pagamento"
                                          >
                                            Boleto
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openParcelaLink(s.id, "nf")}
                                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[0.65rem] font-semibold hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                                            title="Nota fiscal ou documento"
                                          >
                                            Nota
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {cobSendModalOpen && cobSendClient ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cob-send-title"
          onClick={() => void closeCobSendModal()}
          onKeyDown={(ev) => {
            if (ev.key === "Escape" && !sendingCobEmailClientId) closeCobSendModal();
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl outline-none dark:border-slate-700 dark:bg-slate-950"
            onClick={(e) => {
              e.stopPropagation();
            }}
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <h2
                  id="cob-send-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Revisar e-mail — {cobSendClient.fantasy}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Altere destinatários e texto. Enviamos texto simples e uma versão HTML com marca{" "}
                  <span className="font-semibold text-[#1b5e37] dark:text-emerald-300">Radio Ibiza</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void closeCobSendModal()}
                disabled={Boolean(sendingCobEmailClientId) || cobSendPreviewLoading}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {cobSendPreviewLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  A preparar texto e PDFs das parcelas…
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Para (e-mails separados por vírgula)
                    </label>
                    <textarea
                      value={cobSendEmailRaw}
                      onChange={(e) => setCobSendEmailRaw(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Assunto
                    </label>
                    <input
                      value={cobSendSubject}
                      onChange={(e) => setCobSendSubject(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Mensagem (texto)
                    </label>
                    <textarea
                      value={cobSendBody}
                      onChange={(e) => setCobSendBody(e.target.value)}
                      rows={12}
                      spellCheck={true}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs leading-relaxed dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[0.7rem]">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      PDFs a anexar: {cobSendPdfCount}
                    </span>
                    {cobSendHadGaps ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-950 dark:bg-amber-950/55 dark:text-amber-50">
                        Atenção: uma ou mais parcelas não geraram PDF automático.
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                    No envio, o servidor gera novamente o HTML com base no texto acima (mantendo o mesmo cabeçalho Radio Ibiza). A pré-visualização
                    em baixo pode ficar antiga até fechar e reabrir esta janela.
                  </p>
                  {cobSendHtmlPreview ? (
                    <details className="rounded-lg border border-slate-200 dark:border-slate-700">
                      <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Pré-visualização HTML (como aparece ao cliente)
                      </summary>
                      <iframe
                        title="HTML do e-mail"
                        sandbox=""
                        srcDoc={cobSendHtmlPreview}
                        className="h-60 w-full border-t border-slate-200 bg-white dark:border-slate-700"
                      />
                    </details>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => void closeCobSendModal()}
                disabled={
                  cobSendPreviewLoading || sendingCobEmailClientId === cobSendClient.id
                }
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={cobSendPreviewLoading || sendingCobEmailClientId === cobSendClient.id}
                onClick={() => void confirmCobChargesEmailSend()}
                className="rounded-lg bg-[#0066cc] px-4 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-50 dark:bg-sky-600"
              >
                {sendingCobEmailClientId === cobSendClient.id ? "A enviar…" : "Enviar agora"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="mt-8 text-xs text-slate-500 dark:text-slate-500">
        {COMPANY_NAME} — variáveis:{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">DATABASE_URL</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">CONTA_AZUL_CLIENT_ID</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">CONTA_AZUL_CLIENT_SECRET</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">CONTA_AZUL_REDIRECT_URI</code>,{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">NEXT_PUBLIC_SITE_URL</code>.
      </footer>
    </div>
  );
}