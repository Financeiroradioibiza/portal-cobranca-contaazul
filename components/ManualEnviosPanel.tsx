"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CopyTextButton } from "@/components/CopyTextButton";
import { COMPANY_NAME } from "@/lib/brand";
import { readJsonFromResponse } from "@/lib/safeHttpJson";
import {
  buildOcEmailVars,
  parseOcEmailRecipients,
  renderOcEmailText,
} from "@/lib/manualReminders/ocEmailRender";
import {
  currentBrazilYearMonth,
  formatPriorBrazilMonthBillingLabel,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/manualReminders/yearMonth";

type LinhaPayload = {
  id: string;
  emissionDay: number;
  clienteNome: string;
  cnpjDocumento: string | null;
  contaAzulPersonId: string | null;
  solicitarPedirOc: boolean;
  anexarListagemClientesOc: boolean;
  ocListagemAnexoPresente?: boolean;
  listagemClienteArquivoNome?: string | null;
  listagemClienteArquivoMime?: string | null;
  status: "pendente" | "solicitado_ordem" | "enviado";
  emailCobranca: string | null;
  spreadsheetHint: string | null;
  notes: string;
  sortOrder: number;
  updatedAt: string;
};

type MonthMeta = { id: string; yearMonth: number };

type PessoaHit = { id: string; nome: string; documento?: string | null };

async function patchRow(id: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/manual-envios/rows/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function deleteRowReq(id: string): Promise<boolean> {
  const res = await fetch(`/api/manual-envios/rows/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return res.ok;
}

export function ManualEnviosPanel() {
  const nowYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const [activeYm, setActiveYm] = useState<number>(nowYm);
  const [linhas, setLinhas] = useState<LinhaPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  /** Modal vinculação CA */
  const [linkModalRowId, setLinkModalRowId] = useState<string | null>(null);
  const [buscaCa, setBuscaCa] = useState("");
  const [hitsCa, setHitsCa] = useState<PessoaHit[]>([]);
  const [syncingEmails, setSyncingEmails] = useState(false);
  /** Estado do OAuth gravado em Postgres (/api/contaazul/status) — mesmo critério do painel cobrança. */
  const [caServerConnected, setCaServerConnected] = useState<boolean | null>(null);
  const [linkModalNotice, setLinkModalNotice] = useState<string | null>(null);

  const [ocEmailSubject, setOcEmailSubject] = useState("");
  const [ocEmailBody, setOcEmailBody] = useState("");
  const [ocSmtpConfigured, setOcSmtpConfigured] = useState(false);
  const [ocEmailTemplateLoading, setOcEmailTemplateLoading] = useState(true);
  const [ocEmailSaving, setOcEmailSaving] = useState(false);
  const [ocSendingRowId, setOcSendingRowId] = useState<string | null>(null);
  const [ocListagemBusyRowId, setOcListagemBusyRowId] = useState<string | null>(null);
  const [ocPreviewClienteNome, setOcPreviewClienteNome] = useState("");

  /** Remover competência (DELETE /month/:ym com senha de login no portal). */
  const [deleteMonthModalYm, setDeleteMonthModalYm] = useState<number | null>(null);
  const [deleteMonthPwd, setDeleteMonthPwd] = useState("");
  const [deleteMonthBusy, setDeleteMonthBusy] = useState(false);
  const [deleteMonthModalErr, setDeleteMonthModalErr] = useState<string | null>(null);

  const reloadMonthsOnly = useCallback(async () => {
    const res = await fetch("/api/manual-envios/months", { credentials: "include" });
    const { data, parseError, rawText } = await readJsonFromResponse<{ months?: MonthMeta[] }>(res);
    if (!parseError && data?.months) setMonths(data.months);
    else setMsg(rawText.trim().slice(0, 200) || "Falha ao listar meses.");
  }, []);

  const loadMonthRows = useCallback(async (ym: number) => {
    setLoading(true);
    const res = await fetch(`/api/manual-envios/month/${ym}`, { credentials: "include" });
    const { data, parseError, rawText } = await readJsonFromResponse<{
      month?: { id: string; yearMonth: number; linhas: LinhaPayload[] };
      error?: string;
    }>(res);
    if (!parseError && data?.month) {
      setLinhas(data.month.linhas);
      setActiveYm(data.month.yearMonth);
      setMsg(null);
      void reloadMonthsOnly();
    } else {
      setLinhas([]);
      setMsg(data?.error || rawText.trim().slice(0, 240) || "Erro ao carregar mês.");
    }
    setLoading(false);
  }, [reloadMonthsOnly]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const res = await fetch("/api/contaazul/status", { credentials: "include" });
      const { data, parseError } = await readJsonFromResponse<{ connected?: boolean }>(res);
      if (canceled || parseError || !data) return;
      if (typeof data.connected === "boolean") setCaServerConnected(data.connected);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      setOcEmailTemplateLoading(true);
      try {
        const res = await fetch("/api/manual-envios/oc-email/template", { credentials: "include" });
        const { data, parseError } = await readJsonFromResponse<{
          subject?: string;
          bodyText?: string;
          smtpConfigured?: boolean;
        }>(res);
        if (canceled || parseError || !data) return;
        if (typeof data.subject === "string") setOcEmailSubject(data.subject);
        if (typeof data.bodyText === "string") setOcEmailBody(data.bodyText);
        setOcSmtpConfigured(Boolean(data.smtpConfigured));
      } finally {
        if (!canceled) setOcEmailTemplateLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      /** Garante mês atual com snapshot na primeira entrada. */
      const res = await fetch("/api/manual-envios/months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const { data, parseError, rawText } = await readJsonFromResponse<{
        months?: MonthMeta[];
        activeYearMonth?: number;
        month?: { id: string; yearMonth: number; linhas: LinhaPayload[] };
      }>(res);
      if (parseError || !data) {
        setMsg(rawText.trim().slice(0, 200) || "Falha ao inicializar lista.");
        setLoading(false);
        return;
      }
      if (data.months?.length) setMonths(data.months);
      const startYm = typeof data.activeYearMonth === "number" ? data.activeYearMonth : nowYm;
      setActiveYm(startYm);
      if (data.month?.linhas?.length !== undefined && data.month.yearMonth === startYm) {
        setLinhas(data.month.linhas);
        setLoading(false);
      } else {
        await loadMonthRows(startYm);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!linkModalRowId) {
      setHitsCa([]);
      setLinkModalNotice(null);
      return;
    }
    const q = buscaCa.trim();
    if (q.length < 2) {
      setHitsCa([]);
      setLinkModalNotice(null);
      return;
    }
    t = setTimeout(async () => {
      const res = await fetch(
        `/api/manual-envios/contaazul/pessoas?q=${encodeURIComponent(q.slice(0, 120))}`,
        { credentials: "include" },
      );
      const { data } = await readJsonFromResponse<{
        connected?: boolean | null;
        message?: string;
        caError?: string;
        pessoas?: PessoaHit[];
      }>(res);
      setHitsCa(data?.pessoas ?? []);
      if (data?.connected === false && data.message) {
        setLinkModalNotice(data.message);
      } else if (data?.caError) {
        setLinkModalNotice(`Falha na API ao listar cadastros: ${data.caError}`);
      } else if (Array.isArray(data?.pessoas) && data.pessoas.length === 0 && data?.connected === true) {
        setLinkModalNotice(
          "Nenhuma pessoa retornada com esse texto — tente o nome oficial do cliente, só o CNPJ (só dígitos) ou início menor da razão.",
        );
      } else {
        setLinkModalNotice(null);
      }
    }, 380);
    return () => clearTimeout(t);
  }, [buscaCa, linkModalRowId]);

  const confirmDeleteMonth = useCallback(async () => {
    if (deleteMonthModalYm === null) return;
    setDeleteMonthBusy(true);
    setDeleteMonthModalErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/manual-envios/month/${deleteMonthModalYm}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deleteMonthPwd }),
      });
      const { data, parseError, rawText } = await readJsonFromResponse<{
        ok?: boolean;
        months?: MonthMeta[];
        error?: string;
      }>(res);

      if (parseError || !data) {
        setDeleteMonthModalErr(rawText.trim().slice(0, 240) || "Resposta inválida.");
        return;
      }

      if (!res.ok) {
        const err =
          data.error === "invalid_password"
            ? "Senha incorreta (tem de ser a mesma do seu login neste portal)."
            : data.error === "not_found"
              ? "Esta competência já não existe (foi removida?)."
              : (data.error || rawText).trim().slice(0, 240) || "Falha ao apagar.";
        setDeleteMonthModalErr(err);
        return;
      }

      if (!data.ok || !Array.isArray(data.months)) {
        setDeleteMonthModalErr("Resposta incompleta do servidor.");
        return;
      }

      setMonths(data.months);
      setDeleteMonthModalYm(null);
      setDeleteMonthPwd("");

      if (data.months.length > 0) {
        const nextYm = [...data.months].sort((a, b) => b.yearMonth - a.yearMonth)[0]!.yearMonth;
        await loadMonthRows(nextYm);
      } else {
        const boot = await fetch("/api/manual-envios/months", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const bootParsed = await readJsonFromResponse<{
          months?: MonthMeta[];
          activeYearMonth?: number;
          month?: { id: string; yearMonth: number; linhas: LinhaPayload[] };
        }>(boot);
        if (!bootParsed.parseError && bootParsed.data?.months) {
          setMonths(bootParsed.data.months);
          const y =
            typeof bootParsed.data.activeYearMonth === "number"
              ? bootParsed.data.activeYearMonth
              : nowYm;
          if (
            bootParsed.data.month?.linhas?.length !== undefined &&
            bootParsed.data.month.yearMonth === y
          ) {
            setLinhas(bootParsed.data.month.linhas);
            setActiveYm(y);
          } else {
            await loadMonthRows(y);
          }
        } else {
          setMsg(
            "Todas as competências foram apagadas; não consegui recriar o período atual. Recarregue esta página.",
          );
          setLinhas([]);
        }
      }
    } finally {
      setDeleteMonthBusy(false);
    }
  }, [deleteMonthModalYm, deleteMonthPwd, loadMonthRows, nowYm]);

  const onEnsureNextMonth = useCallback(async () => {
    const latest = months[0]?.yearMonth ?? activeYm;
    const next = shiftYearMonth(latest, 1);
    if (months.some((m) => m.yearMonth === next)) {
      await loadMonthRows(next);
      return;
    }
    setMsg(null);
    const res = await fetch("/api/manual-envios/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ yearMonth: next }),
    });
    const { data, parseError, rawText } = await readJsonFromResponse<{
      month?: { id: string; yearMonth: number; linhas: LinhaPayload[] };
    }>(res);
    if (!parseError && data?.month) {
      setLinhas(data.month.linhas);
      setActiveYm(next);
      await reloadMonthsOnly();
    } else {
      setMsg(rawText.trim().slice(0, 220) || "Não consegui criar o próximo mês.");
    }
  }, [activeYm, loadMonthRows, months, reloadMonthsOnly]);

  const postRefreshCaRow = useCallback(
    async (rowId: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/manual-envios/rows/${encodeURIComponent(rowId)}/refresh-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const { data } = await readJsonFromResponse<{
        connected?: boolean;
        message?: string;
        billingEmailsEmptyHint?: string | null;
        errorDetail?: string;
        row?: LinhaPayload;
      }>(res);
      if (data?.connected === false && data.message) {
        setMsg(data.message);
        return false;
      }
      if (data?.billingEmailsEmptyHint) {
        setMsg(data.billingEmailsEmptyHint);
      } else if (data?.errorDetail && !data.row) {
        setMsg(data.errorDetail.slice(0, 400));
        return false;
      }
      if (!data?.row) {
        setMsg("Resposta incompleta ao sincronizar e-mail pela Conta Azul.");
        return false;
      }
      await loadMonthRows(activeYm);
      return true;
    },
    [activeYm, loadMonthRows],
  );

  const uploadOcListagemFile = useCallback(
    async (rowId: string, file: File) => {
      setOcListagemBusyRowId(rowId);
      setMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(
          `/api/manual-envios/rows/${encodeURIComponent(rowId)}/oc-listagem-arquivo`,
          { method: "POST", body: fd, credentials: "include" },
        );
        const { data, rawText } = await readJsonFromResponse<{
          error?: string;
        }>(res);
        if (!res.ok) {
          const detail = (data?.error ?? rawText).trim().slice(0, 240);
          setMsg(detail || `Falha ao enviar ficheiro (${res.status}).`);
          return;
        }
        await loadMonthRows(activeYm);
      } finally {
        setOcListagemBusyRowId(null);
      }
    },
    [activeYm, loadMonthRows],
  );

  const clearOcListagemFile = useCallback(
    async (rowId: string) => {
      setOcListagemBusyRowId(rowId);
      setMsg(null);
      try {
        const res = await fetch(
          `/api/manual-envios/rows/${encodeURIComponent(rowId)}/oc-listagem-arquivo`,
          { method: "DELETE", credentials: "include" },
        );
        const { rawText } = await readJsonFromResponse<{ error?: string }>(res);
        if (!res.ok) {
          setMsg(rawText.trim().slice(0, 200) || "Falha ao remover anexo.");
          return;
        }
        await loadMonthRows(activeYm);
      } finally {
        setOcListagemBusyRowId(null);
      }
    },
    [activeYm, loadMonthRows],
  );

  const ocPreviewVars = useMemo(
    () =>
      buildOcEmailVars({
        clienteNome: ocPreviewClienteNome.trim() || `Cliente exemplo (${COMPANY_NAME})`,
        mesLabel: formatPriorBrazilMonthBillingLabel(),
        cnpjDocumento: "00.000.000/0001-91",
      }),
    [ocPreviewClienteNome],
  );

  const ocPreviewSubjectRendered = useMemo(
    () => renderOcEmailText(ocEmailSubject, ocPreviewVars),
    [ocEmailSubject, ocPreviewVars],
  );

  const ocPreviewBodyRendered = useMemo(
    () => renderOcEmailText(ocEmailBody, ocPreviewVars),
    [ocEmailBody, ocPreviewVars],
  );

  const persistOcEmailTemplate = async () => {
    setOcEmailSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/manual-envios/oc-email/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: ocEmailSubject, bodyText: ocEmailBody }),
      });
      const { data } = await readJsonFromResponse<{ smtpConfigured?: boolean; error?: string }>(res);
      if (typeof data?.smtpConfigured === "boolean") setOcSmtpConfigured(data.smtpConfigured);
      if (!res.ok) {
        setMsg(data?.error || "Não foi possível salvar o modelo de e-mail.");
        return;
      }
      setMsg("Modelo de e-mail salvo no servidor.");
    } finally {
      setOcEmailSaving(false);
    }
  };

  const sendOcEmailForRow = async (row: LinhaPayload) => {
    const to = parseOcEmailRecipients(row.emailCobranca);
    if (!to.length) {
      setMsg("Defina pelo menos um e-mail na coluna de cobrança desta linha antes de disparar.");
      return;
    }
    if ((row.anexarListagemClientesOc ?? false) && !(row.ocListagemAnexoPresente ?? false)) {
      setMsg(
        "Esta linha pede envio mensal da listagem/imagem («Arquivo»). Envie primeiro o ficheiro deste mês antes de disparar o e-mail OC.",
      );
      return;
    }
    if (!ocSmtpConfigured) {
      setMsg(
        "Envio SMTP ainda não está ativo neste servidor. Configure OC_EMAIL_* no hospedeiro conforme `.env.example` (Locaweb — conta cobranca@radioibiza.com.br).",
      );
      return;
    }
    const vars = buildOcEmailVars({
      clienteNome: row.clienteNome,
      mesLabel: formatPriorBrazilMonthBillingLabel(),
      cnpjDocumento: row.cnpjDocumento ?? "—",
    });
    const subjPreview = renderOcEmailText(ocEmailSubject, vars);
    const okConfirm = window.confirm(
      `Enviar e-mail oficial de pedido de OC?\n\nRemetente: SMTP configurado para ${COMPANY_NAME}\nPara: ${to.join(", ")}\nAssunto: ${subjPreview}\n`,
    );
    if (!okConfirm) return;
    setOcSendingRowId(row.id);
    setMsg(null);
    try {
      const res = await fetch("/api/manual-envios/oc-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rowId: row.id, marcarSolicitadoOrdem: true }),
      });
      const { data } = await readJsonFromResponse<{
        ok?: boolean;
        message?: string;
        error?: string;
        destinatarios?: string[];
      }>(res);
      if (!res.ok || !data?.ok) {
        setMsg(data?.message ?? data?.error ?? "Falha ao enviar o e-mail SMTP.");
        return;
      }
      setMsg(`E-mail enviado para ${(data.destinatarios ?? []).join(", ")}. Status → solicitada OC.`);
      await loadMonthRows(activeYm);
    } finally {
      setOcSendingRowId(null);
    }
  };

  const refreshAllEmails = async () => {
    setSyncingEmails(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/manual-envios/month/${activeYm}/refresh-emails`, {
        method: "POST",
        credentials: "include",
      });
      const { data } = await readJsonFromResponse<{
        connected?: boolean;
        message?: string;
        atualizados?: number;
        falhas?: number;
      }>(res);
      if (data?.connected === false && data.message) {
        setMsg(data.message);
        return;
      }
      if (data) {
        setMsg(
          data.falhas
            ? `E-mails atualizados: ${data.atualizados ?? 0}. Falhas: ${data.falhas ?? 0}. Recarregar se precisar revisar mensagens na API.`
            : `E-mails atualizados: ${data.atualizados ?? 0}.`,
        );
      }
      await loadMonthRows(activeYm);
    } finally {
      setSyncingEmails(false);
    }
  };

  const addLinha = async () => {
    const res = await fetch(`/api/manual-envios/month/${activeYm}/rows`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) await loadMonthRows(activeYm);
  };

  const onSelectHit = async (hit: PessoaHit) => {
    if (!linkModalRowId) return;
    const res = await fetch(`/api/manual-envios/rows/${encodeURIComponent(linkModalRowId)}/refresh-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ personId: hit.id }),
    });
    const { data } = await readJsonFromResponse<{
      connected?: boolean;
      message?: string;
      billingEmailsEmptyHint?: string | null;
      errorDetail?: string;
      row?: LinhaPayload;
    }>(res);

    if (data?.connected === false && data.message) {
      setMsg(data.message);
      return;
    }
    if (data?.billingEmailsEmptyHint) {
      setMsg(data.billingEmailsEmptyHint);
    }
    if (data?.errorDetail && !data.row) {
      setMsg(data.errorDetail.slice(0, 400));
      return;
    }

    if (data?.row) {
      setLinkModalRowId(null);
      setBuscaCa("");
      await loadMonthRows(activeYm);
      return;
    }
    setMsg("Resposta inesperada ao vincular no Conta Azul. Veja rede / logs ou tente «Reautorizar» no painel principal.");
  };

  const statusLabels: Record<LinhaPayload["status"], string> = {
    pendente: "Pendente",
    solicitado_ordem: "Solicitada OC (e-mail)",
    enviado: "NFe / envio ao cliente feito",
  };

  const dueTodayLabel = (day: number) => (
    <span title="Todo mês repetir esta data para lembrar o pedido de OC">
      dia {day}
    </span>
  );

  return (
    <div className="mx-auto max-w-[120rem] px-4 py-8">
      {linkModalRowId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[min(560px,90vh)] w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Buscar cliente no Conta Azul
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Encontre pela razão ou fantasia cadastradas; o e-mail será o de cobrança/faturamento.
                </p>
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                onClick={() => {
                  setLinkModalRowId(null);
                  setBuscaCa("");
                }}
              >
                Fechar
              </button>
            </div>
            <div className="space-y-2 p-4">
              <input
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                placeholder="Nome do cadastro ou CNPJ (só números)…"
                value={buscaCa}
                autoFocus
                onChange={(e) => setBuscaCa(e.target.value)}
              />
              {linkModalNotice ? (
                <div
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  {linkModalNotice}
                </div>
              ) : null}
              <div className="max-h-[min(360px,50vh)] space-y-1 overflow-y-auto pr-1">
                {hitsCa.length === 0 && buscaCa.trim().length >= 2 && !linkModalNotice ? (
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    Buscando no Conta Azul…
                  </p>
                ) : null}
                {hitsCa.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="w-full rounded border border-transparent px-2 py-2 text-left text-sm hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                    onClick={() => void onSelectHit(h)}
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100">{h.nome}</span>
                    {h.documento ? (
                      <span className="ml-2 text-xs text-slate-500">{h.documento}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteMonthModalYm !== null ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-month-heading"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-rose-200 bg-white shadow-xl dark:border-rose-900/70 dark:bg-slate-900">
            <div className="border-b border-rose-100 px-4 py-3 dark:border-rose-900/50">
              <p id="delete-month-heading" className="text-sm font-semibold text-rose-900 dark:text-rose-100">
                Remover competência {formatYearMonthLabel(deleteMonthModalYm)}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Esta ação não pode ser anulada — todas as linhas e anexos deste período são apagados. Digite a
                <strong className="font-semibold text-slate-800 dark:text-slate-100"> sua senha de login neste portal</strong>{" "}
                para confirmar.
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Senha
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deleteMonthPwd}
                  onChange={(e) => setDeleteMonthPwd(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  placeholder="Mesma senha do login"
                  disabled={deleteMonthBusy}
                />
              </label>
              {deleteMonthModalErr ? (
                <p
                  role="alert"
                  className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  {deleteMonthModalErr}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleteMonthBusy}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setDeleteMonthModalYm(null);
                    setDeleteMonthPwd("");
                    setDeleteMonthModalErr(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMonthBusy || !deleteMonthPwd.trim()}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-700 dark:hover:bg-rose-600"
                  onClick={() => void confirmDeleteMonth()}
                >
                  {deleteMonthBusy ? "Apagando…" : "Remover período"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0066cc] dark:text-sky-400">
            {COMPANY_NAME}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Envios manuais — ordem de compra (OC)
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Lista baseada na planilha de envios. Cada mês começa zerado nos status; você edita PDVs, marca se deve
            ou não pedir OC e avança até a nota fiscal / envio. E-mails partem sempre do cadastro{" "}
            <strong>contato cobrança/faturamento</strong> do Conta Azul (campo oficial da API), não das colunas da
            planilha.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500 dark:text-slate-500">
            Se existir cron em produção (ver README), o envio automático de pedido de OC corre{" "}
            <strong>só na data «Dia OC»</strong> (horário Brasília),{" "}
            <strong>só com status Pendente</strong> e «Pedir OC» ligado — se você marcar antes{" "}
            <strong>Solicitada OC</strong> ou <strong>Enviada</strong>, esse fluxo não dispara novamente esse pedido no
            mesmo ciclo (máximo uma vez por dia por linha, enquanto ainda pendente).
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ThemeToggle />
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Voltar ao painel
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMonthRows(activeYm)}
              className="rounded-lg bg-[#0066cc] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 dark:bg-sky-600"
            >
              Recarregar
            </button>
          </div>
        </div>
      </header>

      {msg ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {msg}
        </div>
      ) : null}

      {caServerConnected === false ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
        >
          <strong className="font-semibold">OAuth Conta Azul ausente neste servidor.</strong> Para buscar cliente e copiar e-mail de cobrança, abra{" "}
          <Link href="/" className="font-semibold text-sky-800 underline decoration-sky-800/70 hover:text-sky-900 dark:text-sky-300 dark:decoration-sky-400/70">
            o painel principal
          </Link>{" "}
          neste mesmo domínio (use «Conectar Conta Azul» ou «Reautorizar»), depois volte em Envios manuais.
        </div>
      ) : caServerConnected === true ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50">
          Sessão Conta Azul ativa neste servidor — use «Vincular CA» em cada linha para trazer e-mail cobrança/faturamento automaticamente.
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/40">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Modelo do e-mail (pedido de OC)
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Texto padrão da <strong>{COMPANY_NAME}</strong>, com o nome do cliente. O envio real usa SMTP da Locaweb
              (<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">cobranca@radioibiza.com.br</code>{" "}
              quando configurado no servidor).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocEmailSaving || ocEmailTemplateLoading}
              onClick={() => void persistOcEmailTemplate()}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
            >
              {ocEmailSaving ? "Salvando…" : "Salvar modelo"}
            </button>
          </div>
        </div>
        {!ocSmtpConfigured ? (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
            <strong>SMTP ainda não ligado aqui:</strong> defina{" "}
            <code className="text-[11px]">OC_EMAIL_SMTP_*</code> e <code className="text-[11px]">OC_EMAIL_FROM</code> no
            ambiente — veja `.env.example` (host/porta vêm do painel Locaweb da caixa postal).
          </p>
        ) : (
          <p className="mb-3 rounded-md border border-emerald-800/40 bg-emerald-950/30 px-2 py-1.5 text-xs text-emerald-100">
            SMTP parametrizado no servidor — o botão por linha abaixo usa o modelo salvo. Todo envio leva sempre{" "}
            <strong>Cc</strong> para{" "}
            <code className="rounded bg-emerald-900/60 px-1 text-[10px]">cobranca@radioibiza.com.br</code>{" "}
            (+ BCC internos opcionais em <code className="text-[10px]">OC_EMAIL_BCC_*</code>, sem duplicar Cc/Para).
          </p>
        )}
        <p className="mb-2 text-[11px] text-slate-600 dark:text-slate-400">
          Variáveis:{" "}
          <code className="mr-2 rounded bg-slate-100 px-1 dark:bg-slate-800">{"{{clienteNome}}"}</code>
          <code className="mr-2 rounded bg-slate-100 px-1 dark:bg-slate-800">{"{{mesLabel}}"}</code>
          <code className="mr-2 rounded bg-slate-100 px-1 dark:bg-slate-800">{"{{empresaNome}}"}</code>
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{"{{cnpjDocumento}}"}</code>
          <span className="mt-1 block text-slate-500 dark:text-slate-500">
            No envio (e nesta prévia),{" "}
            <code className="rounded bg-slate-100 px-0.5 text-[10px] dark:bg-slate-800">{"{{mesLabel}}"}</code> é sempre a
            competência de <strong>mês anterior</strong> ao dia de hoje (horário Brasil), ex.: 1º de maio →{" "}
            <strong>{formatPriorBrazilMonthBillingLabel()}</strong>.
          </span>
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Assunto</label>
              <input
                value={ocEmailSubject}
                disabled={ocEmailTemplateLoading}
                onChange={(e) => setOcEmailSubject(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Corpo (texto)
              </label>
              <textarea
                value={ocEmailBody}
                disabled={ocEmailTemplateLoading}
                rows={14}
                onChange={(e) => setOcEmailBody(e.target.value)}
                className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs leading-relaxed dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Nome do cliente só para pré-visualizar
            </label>
            <input
              value={ocPreviewClienteNome}
              onChange={(e) => setOcPreviewClienteNome(e.target.value)}
              placeholder="Ex.: nome do cliente (apenas exemplo na pré-visualização)"
              className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/70">
              <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Pré-visualização</p>
              <p className="mb-2 text-xs font-semibold text-slate-900 dark:text-slate-50">{ocPreviewSubjectRendered}</p>
              <pre className="whitespace-pre-wrap break-words font-sans text-xs text-slate-800 dark:text-slate-100">
                {ocEmailTemplateLoading ? "Carregando modelo…" : ocPreviewBodyRendered}
              </pre>
              <div className="mt-2">
                <CopyTextButton
                  variant="text"
                  label="Copiar pré-visualização do corpo do pedido OC"
                  text={ocPreviewBodyRendered}
                  className="text-[11px] text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Períodos (mesmo que extrato por mês)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void onEnsureNextMonth()}
              className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-900"
              title="Duplica linhas da competência anterior mais recente que já tenha clientes gravados — inclui vínculo Conta Azul e e-mail de cobrança. Se houve buraco entre meses, não fica só com templates seed. Mantém «Pedir OC» e «Arquivo»; não copia o binário da listagem. Primeira competência sem nada antes continua nos templates seed."
            >
              + Novo mês seguinte
            </button>
            <button
              type="button"
              disabled={syncingEmails || loading}
              onClick={() => void refreshAllEmails()}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {syncingEmails ? "Sincronizando CA…" : "Atualizar e-mails Conta Azul"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void addLinha()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 dark:bg-emerald-700"
            >
              Nova linha
            </button>
            <button
              type="button"
              disabled={loading || months.length === 0}
              onClick={() => {
                setDeleteMonthModalYm(activeYm);
                setDeleteMonthPwd("");
                setDeleteMonthModalErr(null);
              }}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/70"
              title={`Apaga todo o período ${formatYearMonthLabel(activeYm)} na base OC (senha de login exigida).`}
            >
              Apagar período atual
            </button>
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {[...months]
            .sort((a, b) => b.yearMonth - a.yearMonth)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  void loadMonthRows(m.yearMonth);
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  m.yearMonth === activeYm
                    ? "border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-50"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {formatYearMonthLabel(m.yearMonth)}
              </button>
            ))}
          {months.length === 0 && !loading ? (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Gerando período inicial…
            </span>
          ) : null}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Dia OC</th>
              <th className="min-w-[12rem] px-3 py-2 font-semibold">Cliente (Conta Azul)</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">CNPJ</th>
              <th className="px-3 py-2 font-semibold text-center">Pedir OC</th>
              <th className="min-w-[10rem] px-3 py-2 font-semibold text-center">Arquivo</th>
              <th className="min-w-[9rem] px-3 py-2 font-semibold">Status</th>
              <th className="min-w-[11rem] px-3 py-2 font-semibold">E-mail cobrança (CA)</th>
              <th className="min-w-[8rem] px-3 py-2 font-semibold">Tarefa (plan.)</th>
              <th className="min-w-[10rem] px-3 py-2 font-semibold">Notas internas</th>
              <th className="min-w-[7rem] px-3 py-2 font-semibold">SMTP OC</th>
              <th className="px-3 py-2 font-semibold">Vínculo / linha</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            ) : linhas.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                  Este mês está vazio. Use &quot;Novo mês seguinte&quot; ou recrie a partir dos templates pelo
                  API.
                </td>
              </tr>
            ) : (
              linhas.map((row, idx) => {
                const stripe =
                  idx % 2 === 0
                    ? "bg-white dark:bg-slate-950/20"
                    : "bg-slate-50/80 dark:bg-slate-950/55";
                return (
                  <tr
                    key={`${row.id}-${row.updatedAt}`}
                    className={`border-b border-slate-100 dark:border-slate-800 ${stripe}`}
                  >
                    <td className="align-top px-3 py-2">
                      <input
                        defaultValue={row.emissionDay}
                        aria-label={`Dia de emissão / lembrete — ${row.clienteNome}`}
                        className="w-14 rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900"
                        type="number"
                        min={1}
                        max={31}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || v < 1 || v > 31) return void loadMonthRows(activeYm);
                          void patchRow(row.id, { emissionDay: Math.floor(v) }).then((ok) => {
                            if (ok) void loadMonthRows(activeYm);
                          });
                        }}
                      />
                      <div className="mt-1 text-[10px] text-slate-500">{dueTodayLabel(row.emissionDay)}</div>
                    </td>
                    <td className="align-top px-3 py-2">
                      <textarea
                        rows={3}
                        defaultValue={row.clienteNome}
                        className="w-full resize-y rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                        onBlur={(e) => {
                          const nome = e.target.value.trim();
                          if (!nome) return void loadMonthRows(activeYm);
                          void patchRow(row.id, { clienteNome: nome }).then((ok) => {
                            if (ok) void loadMonthRows(activeYm);
                          });
                        }}
                      />
                    </td>
                    <td className="align-top px-3 py-2">
                      <input
                        defaultValue={row.cnpjDocumento ?? ""}
                        aria-label={`CNPJ — ${row.clienteNome}`}
                        className="w-36 rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900"
                        placeholder="opcional"
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          void patchRow(row.id, {
                            cnpjDocumento: raw.length ? raw : null,
                          }).then(() => loadMonthRows(activeYm));
                        }}
                      />
                    </td>
                    <td className="align-top px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        defaultChecked={row.solicitarPedirOc}
                        aria-label={`Enviar e-mail pedindo OC — ${row.clienteNome}`}
                        className="h-4 w-4 accent-sky-600"
                        onChange={(e) => {
                          void patchRow(row.id, { solicitarPedirOc: e.target.checked }).then((ok) => {
                            if (ok) void loadMonthRows(activeYm);
                          });
                        }}
                      />
                    </td>
                    <td className="max-w-[12rem] align-top px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        defaultChecked={row.anexarListagemClientesOc ?? false}
                        aria-label={`Todo mês: anexar listagem/imagem ao e-mail OC — ${row.clienteNome}`}
                        className="h-4 w-4 accent-amber-600"
                        onChange={(e) => {
                          void patchRow(row.id, { anexarListagemClientesOc: e.target.checked }).then(
                            (ok) => {
                              if (ok) void loadMonthRows(activeYm);
                            },
                          );
                        }}
                      />
                      {row.anexarListagemClientesOc ?? false ? (
                        <div className="mt-2 space-y-1 text-left">
                          <label className="block text-[10px] leading-tight text-slate-600 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              Listagem mês anterior
                            </span>{" "}
                            (CSV, Excel ou imagem até 4&nbsp;MB; renovar cada competência)
                          </label>
                          <input
                            type="file"
                            accept=".csv,.pdf,.xls,.xlsx,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            disabled={
                              ocListagemBusyRowId === row.id ||
                              ocSendingRowId === row.id
                            }
                            className="block w-full cursor-pointer text-[10px] file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-1 file:py-0.5 dark:file:border-slate-600 dark:file:bg-slate-900"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void uploadOcListagemFile(row.id, f);
                            }}
                          />
                          {row.ocListagemAnexoPresente ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-emerald-800 dark:text-emerald-400">
                              <span className="font-medium break-all">
                                {row.listagemClienteArquivoNome ?? "Ficheiro pronto"}
                              </span>
                              <button
                                type="button"
                                disabled={ocListagemBusyRowId === row.id}
                                className="rounded border border-slate-300 px-1.5 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                onClick={() => void clearOcListagemFile(row.id)}
                              >
                                Remover anexo
                              </button>
                            </div>
                          ) : (
                            <p className="text-[10px] leading-tight text-amber-900 dark:text-amber-300">
                              Envie antes de disparar SMTP — obrigatório para esta linha.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          Marcar para pedir OC com listagem.
                        </p>
                      )}
                    </td>
                    <td className="align-top px-3 py-2">
                      <select
                        value={row.status}
                        aria-label={`Status — ${row.clienteNome}`}
                        className="w-full rounded border border-slate-300 px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                        onChange={(e) => {
                          const v = e.target.value as LinhaPayload["status"];
                          void patchRow(row.id, { status: v }).then((ok) => {
                            if (ok) void loadMonthRows(activeYm);
                          });
                        }}
                      >
                        <option value="pendente">{statusLabels.pendente}</option>
                        <option value="solicitado_ordem">{statusLabels.solicitado_ordem}</option>
                        <option value="enviado">{statusLabels.enviado}</option>
                      </select>
                    </td>
                    <td className="align-top px-3 py-2">
                      <textarea
                        rows={4}
                        defaultValue={row.emailCobranca ?? ""}
                        className="w-full resize-y rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                        placeholder="Sincronize com CA ou cole manualmente"
                        onBlur={(e) => {
                          const txt = e.target.value.trim();
                          void patchRow(row.id, {
                            emailCobranca: txt.length ? txt : null,
                          }).then(() => loadMonthRows(activeYm));
                        }}
                      />
                      {row.emailCobranca ? (
                        <div className="mt-1">
                          <CopyTextButton
                            variant="text"
                            label="Copiar e-mails OC desta linha"
                            text={row.emailCobranca}
                            className="text-[11px] text-sky-700 underline-offset-4 hover:underline dark:text-sky-400"
                          />
                        </div>
                      ) : null}
                    </td>
                    <td className="align-top px-3 py-2 text-xs text-slate-700 dark:text-slate-300">
                      {row.spreadsheetHint ?? "—"}
                    </td>
                    <td className="align-top px-3 py-2">
                      <textarea
                        rows={3}
                        defaultValue={row.notes}
                        aria-label={`Notas — ${row.clienteNome}`}
                        className="w-full resize-y rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                        onBlur={(e) => {
                          void patchRow(row.id, { notes: e.target.value }).then((ok) => {
                            if (ok) void loadMonthRows(activeYm);
                          });
                        }}
                      />
                    </td>
                    <td className="align-top px-3 py-2">
                      <button
                        type="button"
                        disabled={ocSendingRowId !== null || ocEmailTemplateLoading}
                        title={
                          ocSmtpConfigured
                            ? "Envia texto do modelo ao e-mail cobrança desta linha (Locaweb SMTP)"
                            : "Configure SMTP no servidor"
                        }
                        onClick={() => void sendOcEmailForRow(row)}
                        className="w-full rounded border border-indigo-500 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-950 hover:bg-indigo-100 disabled:opacity-45 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-50 dark:hover:bg-indigo-900/70"
                      >
                        {ocSendingRowId === row.id ? "Enviando…" : "Disparar e-mail OC"}
                      </button>
                      {!row.solicitarPedirOc ? (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Checkbox «Pedir OC» desmarcado — ainda assim pode disparar manualmente.
                        </p>
                      ) : null}
                      {(row.anexarListagemClientesOc ?? false) &&
                      !(row.ocListagemAnexoPresente ?? false) ? (
                        <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                          «Arquivo»: envie a listagem deste mês antes de disparar SMTP.
                        </p>
                      ) : null}
                    </td>
                    <td className="space-y-1 align-top px-3 py-2">
                      <button
                        type="button"
                        className="w-full rounded border border-sky-600 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-950"
                        onClick={() => {
                          setBuscaCa(row.clienteNome.split(" ").slice(0, 4).join(" "));
                          setLinkModalNotice(null);
                          setLinkModalRowId(row.id);
                        }}
                      >
                        Vincular CA
                      </button>
                      {row.contaAzulPersonId ? (
                        <>
                          <p className="font-mono text-[10px] text-slate-500 break-all" title={row.contaAzulPersonId}>
                            {row.contaAzulPersonId.slice(0, 10)}…
                          </p>
                          <button
                            type="button"
                            className="block w-full text-left text-[11px] text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-400"
                            onClick={() =>
                              void (async () => {
                                await postRefreshCaRow(row.id, {});
                              })()
                            }
                          >
                            Só atualizar e-mail CA
                          </button>
                          <button
                            type="button"
                            className="block text-[11px] text-red-700 hover:underline dark:text-red-400"
                            onClick={() =>
                              void (async () => {
                                await postRefreshCaRow(row.id, { personId: "" });
                              })()
                            }
                          >
                            Limpar vínculo CA
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="w-full rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                        onClick={() => {
                          if (!confirm(`Remover "${row.clienteNome}" só deste mês?`)) return;
                          void deleteRowReq(row.id).then((ok) => {
                            if (ok) void loadMonthRows(activeYm);
                          });
                        }}
                      >
                        Remover linha
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Ordenação por dia da OC no mês, depois pela ordem original da planilha.
        </p>
      </section>
    </div>
  );
}
