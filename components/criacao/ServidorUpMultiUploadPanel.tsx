"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTagChipPreview } from "@/components/criacao/CriativoTagSelect";
import {
  clearServidorUpUploadSession,
  readServidorUpUploadSession,
  type ServidorUpUploadSession,
} from "@/lib/criacao/servidorUpUploadSession";
import type { ServidorUpUploadPlan } from "@/lib/criacao/servidorUpUploadService";

type BuildResponse = {
  ok?: boolean;
  plan?: ServidorUpUploadPlan;
  stats?: {
    lotes: number;
    tracksMatched: number;
    unmatched: number;
    orphanDownloads: number;
    hierarchyErrors: number;
  };
  error?: string;
};

type EnqueueResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  messages?: string[];
  jobIds?: string[];
  stagingImported?: number;
  stagingErrors?: string[];
  stats?: { lotes: number; tracks: number; unmatched: number };
  unmatched?: string[];
};

export function ServidorUpMultiUploadPanel() {
  const router = useRouter();
  const [session, setSession] = useState<ServidorUpUploadSession | null>(null);
  const [plan, setPlan] = useState<ServidorUpUploadPlan | null>(null);
  const [stats, setStats] = useState<BuildResponse["stats"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadPlan = useCallback(async (s: ServidorUpUploadSession) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/criacao/servidor-up/build-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadJobId: s.downloadJobId,
          hierarchyRows: s.hierarchyRows,
          drafts: s.drafts,
          tracks: s.tracks,
        }),
      });
      const data = (await res.json()) as BuildResponse;
      if (!res.ok || !data.plan) {
        throw new Error(data.error ?? "Falha ao montar lotes.");
      }
      setPlan(data.plan);
      setStats(data.stats ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar plano.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = readServidorUpUploadSession();
    setSession(s);
    if (s) void loadPlan(s);
    else setLoading(false);
  }, [loadPlan]);

  async function submitMultiUpload() {
    if (!session || !plan) return;
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/criacao/servidor-up/enqueue-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadJobId: session.downloadJobId,
          titulo: session.titulo,
          hierarchyRows: session.hierarchyRows,
          drafts: session.drafts,
          tracks: session.tracks,
        }),
      });
      const data = (await res.json()) as EnqueueResponse;
      if (!res.ok || !data.ok) {
        if (data.error === "hierarquia_incompleta") {
          throw new Error(data.messages?.join(" · ") ?? "Hierarquia incompleta no passo 0.");
        }
        if (data.error === "nenhuma_faixa_mapeada") {
          throw new Error(
            `Nenhuma faixa mapeada. ${(data.unmatched ?? []).slice(0, 3).join(" · ")}`,
          );
        }
        throw new Error(data.message ?? data.error ?? "Falha no multi-upload.");
      }
      clearServidorUpUploadSession();
      const parts = [
        `${data.stats?.tracks ?? data.stagingImported ?? 0} faixa(s) importadas`,
        `${data.stats?.lotes ?? data.jobIds?.length ?? 0} pasta(s)`,
      ];
      if ((data.stats?.unmatched ?? 0) > 0) parts.push(`${data.stats!.unmatched} não mapeada(s)`);
      if (data.stagingErrors?.length) parts.push(`avisos: ${data.stagingErrors.slice(0, 2).join(" · ")}`);
      setMsg(parts.join(" · "));
      router.push("/criacao/fila");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">Multi-Upload (Servidor UP)</h2>
        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
          Nenhuma sessão Servidor UP ativa. Conclua o download no{" "}
          <Link href="/criacao/servidor-up" className="font-semibold underline">
            Servidor UP
          </Link>{" "}
          e use o Passo 5, ou volte ao{" "}
          <Link href="/criacao/upload" className="font-semibold underline">
            upload comum
          </Link>
          .
        </p>
      </div>
    );
  }

  const totalMatched = plan?.lotes.reduce((n, l) => n + l.tracks.length, 0) ?? 0;

  return (
    <div className="mb-6 rounded-xl border-2 border-violet-400 bg-violet-50/90 p-4 dark:border-violet-600 dark:bg-violet-950/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-violet-950 dark:text-violet-100">
            Multi-Upload (Servidor UP)
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-violet-900/90 dark:text-violet-200/90">
            Pastas e tags já definidas no passo 0 do Servidor UP — cada faixa vai para a programação/pasta
            correta. Job Deemix <code className="text-[10px]">{session.downloadJobId.slice(0, 8)}…</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearServidorUpUploadSession();
            setSession(null);
            setPlan(null);
          }}
          className="rounded border border-violet-300 px-2 py-1 text-[10px] font-semibold dark:border-violet-700"
        >
          Sair do modo Servidor UP
        </button>
      </div>

      {loading ?
        <p className="text-xs text-violet-800/80">Montando lotes por pasta…</p>
      : err ?
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{err}</p>
      : plan ?
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-violet-900 dark:text-violet-200">
            <span className="rounded bg-white/80 px-2 py-0.5 dark:bg-slate-900/60">
              {stats?.lotes ?? plan.lotes.length} pasta(s)
            </span>
            <span className="rounded bg-white/80 px-2 py-0.5 dark:bg-slate-900/60">
              {totalMatched} faixa(s) mapeada(s)
            </span>
            {(stats?.unmatched ?? 0) > 0 ?
              <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {stats!.unmatched} sem match Deemix
              </span>
            : null}
          </div>

          <ul className="mb-3 max-h-64 space-y-2 overflow-y-auto">
            {plan.lotes.map((lote) => (
              <li
                key={lote.hierarchyKey}
                className="rounded-lg border border-violet-200/80 bg-white/90 px-3 py-2 dark:border-violet-800 dark:bg-slate-900/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {lote.clienteNome} · {lote.programacaoNome} / {lote.pastaNome}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {lote.tracks.length} faixa(s) · tag{" "}
                      <span className="font-semibold">{formatTagChipPreview(lote.uploadTagNome)}</span>
                    </div>
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                  {lote.tracks.slice(0, 4).map((t) => (
                    <li key={t.downloadItemId} className="truncate">
                      {t.artista ? `${t.artista} — ` : ""}
                      {t.titulo || t.arquivoNome}
                    </li>
                  ))}
                  {lote.tracks.length > 4 ?
                    <li>… +{lote.tracks.length - 4} faixa(s)</li>
                  : null}
                </ul>
              </li>
            ))}
          </ul>

          {plan.unmatchedTracks.length > 0 ?
            <details className="mb-3 text-[11px] text-amber-900 dark:text-amber-200">
              <summary className="cursor-pointer font-semibold">
                {plan.unmatchedTracks.length} faixa(s) não mapeada(s)
              </summary>
              <ul className="mt-1 list-inside list-disc">
                {plan.unmatchedTracks.slice(0, 15).map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </details>
          : null}

          {msg ?
            <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">{msg}</p>
          : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting || totalMatched === 0}
              onClick={() => void submitMultiUpload()}
              className="rounded-lg bg-violet-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ?
                "Enviando para fila…"
              : `Subir ${totalMatched} faixa(s) para ${plan.lotes.length} pasta(s)`}
            </button>
            <Link
              href="/criacao/servidor-up"
              className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold dark:border-violet-700"
            >
              Voltar ao Servidor UP
            </Link>
          </div>
        </>
      : null}
    </div>
  );
}
