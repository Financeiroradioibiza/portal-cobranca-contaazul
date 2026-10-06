"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EnvioManualAgendamentoDto, EnvioManualLogDto } from "@/lib/enviosManuais/types";
import { ENVIOS_MANUAIS_TEST_EMAIL } from "@/lib/enviosManuais/safeRecipients";

export function EnviosManuaisPanel() {
  const [rows, setRows] = useState<EnvioManualAgendamentoDto[]>([]);
  const [logs, setLogs] = useState<EnvioManualLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, lRes] = await Promise.all([
        fetch("/api/financeiro/envios-manuais/agendamentos", { credentials: "same-origin" }),
        fetch("/api/financeiro/envios-manuais/logs", { credentials: "same-origin" }),
      ]);
      const aJson = await aRes.json();
      const lJson = await lRes.json();
      if (!aRes.ok || !aJson.ok) {
        setError(String(aJson.error ?? "Erro ao carregar agendamentos"));
        return;
      }
      setRows(Array.isArray(aJson.agendamentos) ? aJson.agendamentos : []);
      if (lRes.ok && lJson.ok && Array.isArray(lJson.logs)) setLogs(lJson.logs);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function importUpstash() {
    if (!confirm("Importar agendamentos do Upstash (Vercel)? Isso substitui a lista no portal.")) return;
    setBusy("import");
    setNotice(null);
    try {
      const res = await fetch("/api/financeiro/envios-manuais/import-upstash", { method: "POST", credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(String(json.error ?? json.hint ?? "Falha na importação"));
        return;
      }
      setNotice(`Importados ${json.total} agendamento(s).`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function sendRow(id: string, label: string) {
    if (
      !confirm(
        `Enviar teste para «${label}»?\n\nEnquanto ENVIOS_MANUAIS_LIVE não estiver ativo, o e-mail vai só para ${ENVIOS_MANUAIS_TEST_EMAIL}.`,
      )
    ) {
      return;
    }
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch("/api/financeiro/envios-manuais/send", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agendamentoId: id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(String(json.error ?? "Falha no envio"));
        return;
      }
      setNotice(
        json.sandbox ?
          `Enviado (modo teste) para ${(json.recipients as string[]).join(", ")} · ${json.pdfAttachments} PDF(s).`
        : `Enviado para ${(json.recipients as string[]).join(", ")}.`,
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando envios manuais…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <strong>Modo seguro:</strong> envios usam boleto/NFS-e do portal (mesma lógica de Vencidos). Enquanto{" "}
        <code className="rounded bg-amber-100/80 px-1">ENVIOS_MANUAIS_LIVE=1</code> não estiver no servidor, destino
        fixo: <strong>{ENVIOS_MANUAIS_TEST_EMAIL}</strong>. Cron automático ainda não migrado — use Enviar teste.
      </div>

      {error ?
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      : null}
      {notice ?
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40">
          {notice}
        </div>
      : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void importUpstash()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
        >
          Importar do Upstash (Vercel)
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
        >
          Atualizar
        </button>
        <Link
          href="/financeiro/vencidos"
          className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-700 dark:text-sky-300"
        >
          Vencidos (referência CA)
        </Link>
      </div>

      {rows.length === 0 ?
        <p className="text-sm text-slate-500">
          Nenhum agendamento no portal. Importe do Upstash ou aguarde a próxima etapa (editor no portal).
        </p>
      : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800">
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2">Cliente / grupo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">E-mails (origem)</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/80">
                  <td className="px-3 py-2 tabular-nums">{r.day}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 font-medium">{r.client}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.tipo === "grupo" ? "Grupo" : "Individual"}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.emails.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.sent ? "Enviado" : "Pendente"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void sendRow(r.id, r.client)}
                      className="rounded-md bg-[#0066cc] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-600"
                    >
                      {busy === r.id ? "Enviando…" : "Enviar teste"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }

      {logs.length > 0 ?
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <h2 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800">
            Histórico recente
          </h2>
          <ul className="max-h-48 divide-y divide-slate-50 overflow-y-auto text-xs dark:divide-slate-800">
            {logs.slice(0, 30).map((l) => (
              <li key={l.id} className="px-3 py-2">
                <span className={l.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                  {l.ok ? "OK" : "Erro"}
                </span>{" "}
                · {l.dt} · <strong>{l.client}</strong> · {l.ref}
                {l.sandbox ?
                  <span className="ml-1 text-amber-600">[teste]</span>
                : null}
                {l.aviso ?
                  <span className="ml-1 text-slate-500">— {l.aviso}</span>
                : null}
              </li>
            ))}
          </ul>
        </section>
      : null}
    </div>
  );
}
