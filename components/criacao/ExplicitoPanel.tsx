"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BibliotecaSidebarTree } from "@/lib/criacao/bibliotecaSidebarService";
import type { ExplicitoScanScope } from "@/lib/criacao/explicitoScanService";

type ScopeKind = ExplicitoScanScope["kind"];

type ScanStats = {
  total: number;
  verified: number;
  pending: number;
  geniusEnabled: boolean;
};

type ReportTrack = {
  musicaId: string;
  titulo: string;
  artista: string;
  lyricsSource?: string;
  lyricsUrl?: string;
  geniusUrl?: string;
};

type ScanReport = {
  analyzed: number;
  explicit: number;
  safe: number;
  lyricsNotFound: number;
  explicitItems: ReportTrack[];
  safeItems: ReportTrack[];
  lyricsNotFoundItems: Array<{
    musicaId: string;
    titulo: string;
    artista: string;
    reason?: string;
    geniusUrl?: string;
  }>;
};

const SOURCE_LABEL: Record<string, string> = {
  genius_page: "Genius",
  azlyrics: "AZLyrics",
  lyrics_ovh: "Lyrics.ovh",
};

function ReportTrackList({
  title,
  items,
  tone,
}: {
  title: string;
  items: ReportTrack[];
  tone: "safe" | "explicit";
}) {
  if (items.length === 0) return null;
  const titleCls =
    tone === "explicit" ?
      "text-red-600 dark:text-red-400"
    : "text-emerald-700 dark:text-emerald-300";
  return (
    <div className="mt-4">
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${titleCls}`}>
        {title} ({items.length})
      </h3>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
        {items.map((item) => (
          <li key={item.musicaId}>
            {tone === "explicit" ? "✗ " : "✓ "}
            {item.artista} — {item.titulo}
            {item.lyricsSource ?
              <span className="text-slate-400"> · {SOURCE_LABEL[item.lyricsSource] ?? item.lyricsSource}</span>
            : null}
            {item.lyricsUrl ? (
              <>
                {" "}
                <a
                  href={item.lyricsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 underline dark:text-indigo-400"
                >
                  letra ↗
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const SCOPE_LABELS: Record<ScopeKind, string> = {
  all: "Biblioteca inteira",
  tag: "Tag criativa",
  custom: "Pasta custom",
  prog: "Pasta de programação",
  programacao: "Programação completa",
};

function scopeQuery(scope: ExplicitoScanScope): string {
  const p = new URLSearchParams({ kind: scope.kind });
  if (scope.kind === "tag") p.set("tagId", scope.tagId);
  if (scope.kind === "custom") p.set("bibliotecaPastaId", scope.bibliotecaPastaId);
  if (scope.kind === "prog") p.set("pastaProgramacaoId", scope.pastaProgramacaoId);
  if (scope.kind === "programacao") p.set("programacaoId", scope.programacaoId);
  return p.toString();
}

function scopePayload(scope: ExplicitoScanScope): ExplicitoScanScope {
  return scope;
}

export function ExplicitoPanel() {
  const [tree, setTree] = useState<BibliotecaSidebarTree | null>(null);
  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [tagId, setTagId] = useState("");
  const [customPastaId, setCustomPastaId] = useState("");
  const [progPastaId, setProgPastaId] = useState("");
  const [programacaoId, setProgramacaoId] = useState("");
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  /** null = ainda não verificado; evita falso "Genius desabilitado" enquanto stats carrega. */
  const [geniusOk, setGeniusOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const scope = useMemo((): ExplicitoScanScope | null => {
    switch (scopeKind) {
      case "all":
        return { kind: "all" };
      case "tag":
        return tagId ? { kind: "tag", tagId } : null;
      case "custom":
        return customPastaId ? { kind: "custom", bibliotecaPastaId: customPastaId } : null;
      case "prog":
        return progPastaId ? { kind: "prog", pastaProgramacaoId: progPastaId } : null;
      case "programacao":
        return programacaoId ? { kind: "programacao", programacaoId } : null;
      default:
        return { kind: "all" };
    }
  }, [scopeKind, tagId, customPastaId, progPastaId, programacaoId]);

  const refreshStats = useCallback(async (s: ExplicitoScanScope) => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/criacao/explicito/stats?${scopeQuery(s)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "stats_falhou");
      setStats({
        total: Number(data.total) || 0,
        verified: Number(data.verified) || 0,
        pending: Number(data.pending) || 0,
        geniusEnabled: Boolean(data.geniusEnabled),
      });
      if (data.geniusEnabled === true) setGeniusOk(true);
      if (data.geniusEnabled === false) setGeniusOk(false);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/criacao/explicito/status")
      .then((r) => r.json())
      .then((d) => setGeniusOk(d?.geniusEnabled === true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/criacao/biblioteca/sidebar")
      .then((r) => r.json())
      .then((d) => {
        if (d?.tags || d?.programacoes) setTree(d as BibliotecaSidebarTree);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!scope) {
      setStats(null);
      return;
    }
    void refreshStats(scope).catch(() => undefined);
  }, [scope, refreshStats]);

  const progOptions = useMemo(() => {
    if (!tree) return [];
    return tree.programacoes.flatMap((p) =>
      p.pastas.map((pa) => ({
        id: pa.id,
        label: `${p.clienteNome} · ${p.nome} · ${pa.nome} (${pa.musicaCount})`,
        programacaoId: p.id,
      })),
    );
  }, [tree]);

  const scopeLabel = useMemo(() => {
    switch (scopeKind) {
      case "tag": {
        const t = tree?.tags.find((x) => x.id === tagId);
        return t ? `Tag: ${t.nome}` : "Tag criativa";
      }
      case "custom": {
        const p = tree?.pastasCustom.find((x) => x.id === customPastaId);
        return p ? `Pasta: ${p.nome}` : "Pasta custom";
      }
      case "prog": {
        const hit = progOptions.find((x) => x.id === progPastaId);
        return hit ? `Pasta prog.: ${hit.label.split(" · ").slice(-2).join(" · ")}` : "Pasta de programação";
      }
      case "programacao": {
        const p = tree?.programacoes.find((x) => x.id === programacaoId);
        return p ? `Programação: ${p.clienteNome} · ${p.nome}` : "Programação completa";
      }
      default:
        return "Biblioteca inteira";
    }
  }, [scopeKind, tagId, customPastaId, progPastaId, programacaoId, tree, progOptions]);

  const scanButtonLabel = useMemo(() => {
    if (busy) return "Analisando…";
    if (!stats) return "Iniciar varredura";
    if (stats.pending === 0) return "Nada pendente";
    if (stats.verified === 0) return `Iniciar varredura (${stats.pending} faixas)`;
    return `Continuar restantes (${stats.pending})`;
  }, [busy, stats]);

  const runScan = async () => {
    if (!scope || busy) return;
    if ((stats?.pending ?? 0) === 0) {
      setMsg("Nenhuma faixa pendente neste escopo.");
      return;
    }

    cancelRef.current = false;
    setBusy(true);
    setMsg(null);
    setReport(null);

    const acc: ScanReport = {
      analyzed: 0,
      explicit: 0,
      safe: 0,
      lyricsNotFound: 0,
      explicitItems: [],
      safeItems: [],
      lyricsNotFoundItems: [],
    };

    let done = 0;
    const sessionTarget = stats?.pending ?? 0;
    const sessionProcessed = new Set<string>();
    setProgress({ done: 0, total: sessionTarget });

    try {
      let hasMore = true;
      while (hasMore && !cancelRef.current && sessionProcessed.size < sessionTarget) {
        const res = await fetch("/api/criacao/explicito/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: scopePayload(scope),
            onlyMissing: true,
            limit: 3,
            excludeMusicaIds: [...sessionProcessed],
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "scan_falhou");
        if (data?.geniusEnabled === true) setGeniusOk(true);

        if (Array.isArray(data.results)) {
          for (const row of data.results as Array<{
            musicaId?: string;
            status?: string;
            titulo?: string;
            artista?: string;
            lyricsSource?: string;
            lyricsUrl?: string;
            geniusUrl?: string;
          }>) {
            if (!row.musicaId || row.status === "skipped") continue;
            sessionProcessed.add(row.musicaId);
            const track: ReportTrack = {
              musicaId: row.musicaId,
              titulo: row.titulo ?? "",
              artista: row.artista ?? "",
              lyricsSource: row.lyricsSource,
              lyricsUrl: row.lyricsUrl,
              geniusUrl: row.geniusUrl,
            };
            if (row.status === "explicit") acc.explicitItems.push(track);
            if (row.status === "safe") acc.safeItems.push(track);
          }
        }

        acc.analyzed += Number(data.processed) || 0;
        acc.explicit += Number(data.explicit) || 0;
        acc.safe += Number(data.safe) || 0;
        acc.lyricsNotFound += Number(data.lyricsNotFound) || 0;
        if (Array.isArray(data.lyricsNotFoundList)) {
          acc.lyricsNotFoundItems.push(...data.lyricsNotFoundList);
        }

        done = sessionProcessed.size;
        hasMore = Boolean(data.hasMore) && done < sessionTarget;
        setProgress({ done, total: sessionTarget });
      }

      setReport(acc);
      await refreshStats(scope);
      setMsg(
        cancelRef.current
          ? "Varredura interrompida."
          : `Concluído: ${acc.analyzed} analisadas · ${acc.explicit} explícitas · ${acc.safe} seguras · ${acc.lyricsNotFound} sem letra.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "scan_falhou");
      if (acc.analyzed > 0) setReport(acc);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const stopScan = () => {
    cancelRef.current = true;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">EXPLICITO!</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Busca letras no Genius, AZLyrics (fallback) e filtro local PT+EN. Selo só quando a letra é encontrada e verificada.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Escopo</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(SCOPE_LABELS) as ScopeKind[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => setScopeKind(k)}
              className={
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition " +
                (scopeKind === k
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300")
              }
            >
              {SCOPE_LABELS[k]}
            </button>
          ))}
        </div>

        {scopeKind === "tag" ? (
          <select
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={tagId}
            disabled={busy}
            onChange={(e) => setTagId(e.target.value)}
          >
            <option value="">Selecione uma tag…</option>
            {(tree?.tags ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome} ({t.usoCount})
              </option>
            ))}
          </select>
        ) : null}

        {scopeKind === "custom" ? (
          <select
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={customPastaId}
            disabled={busy}
            onChange={(e) => setCustomPastaId(e.target.value)}
          >
            <option value="">Selecione pasta custom…</option>
            {(tree?.pastasCustom ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.musicaCount})
              </option>
            ))}
          </select>
        ) : null}

        {scopeKind === "prog" ? (
          <select
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={progPastaId}
            disabled={busy}
            onChange={(e) => setProgPastaId(e.target.value)}
          >
            <option value="">Selecione pasta de programação…</option>
            {progOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : null}

        {scopeKind === "programacao" ? (
          <select
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={programacaoId}
            disabled={busy}
            onChange={(e) => setProgramacaoId(e.target.value)}
          >
            <option value="">Selecione programação…</option>
            {(tree?.programacoes ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.clienteNome} · {p.nome}
              </option>
            ))}
          </select>
        ) : null}

        {stats ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500">
              Escopo ativo: {scopeLabel}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-xs text-slate-500">Total no escopo</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950">
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{stats.verified}</div>
              <div className="text-xs text-slate-500">Com selo</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950">
              <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{stats.pending}</div>
              <div className="text-xs text-slate-500">Pendentes</div>
            </div>
            </div>
          </div>
        ) : scopeKind !== "all" ? (
          <p className="mt-3 text-xs text-slate-400">Selecione um item do escopo.</p>
        ) : null}

        {geniusOk === false ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Genius API off — varredura usa <strong>AZLyrics</strong> e lyrics.ovh quando não achar no Genius.
            Configure <code className="font-mono">GENIUS_ACCESS_TOKEN</code> para priorizar o Genius.
          </p>
        ) : geniusOk === null && statsLoading ? (
          <p className="mt-3 text-xs text-slate-400">Verificando Genius…</p>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !scope || (stats?.pending ?? 0) === 0}
          onClick={() => void runScan()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Analisando…" : scanButtonLabel}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={stopScan}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Parar
          </button>
        ) : null}
        {progress ? (
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {progress.done} / {progress.total} do escopo · {scopeLabel}
          </span>
        ) : null}
      </section>

      {msg ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {msg}
        </p>
      ) : null}

      {report ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold">Relatório da sessão</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <li>Analisadas (letra encontrada): {report.analyzed - report.lyricsNotFound}</li>
            <li>Explícitas: {report.explicit}</li>
            <li>Seguras: {report.safe}</li>
            <li>Letra não encontrada: {report.lyricsNotFound}</li>
          </ul>

          <ReportTrackList title="Explícitas" items={report.explicitItems} tone="explicit" />
          <ReportTrackList title="Seguras (passou)" items={report.safeItems} tone="safe" />

          {report.lyricsNotFoundItems.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sem letra (Genius / AZLyrics / lyrics.ovh)
              </h3>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
                {report.lyricsNotFoundItems.map((item) => (
                  <li key={item.musicaId}>
                    {item.artista} — {item.titulo}
                    {item.reason ? ` (${item.reason})` : ""}
                    {item.geniusUrl ? (
                      <>
                        {" "}
                        <a
                          href={item.geniusUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 underline dark:text-indigo-400"
                        >
                          Genius ↗
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        <p className="font-semibold text-slate-700 dark:text-slate-300">Selos na biblioteca</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white"
            title="Letra verificada: segura"
          >
            ✓
          </span>
          <span>Segura (letra OK)</span>
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white"
            title="Letra verificada: conteúdo explícito"
          >
            ✗
          </span>
          <span>Explícita</span>
        </div>
        <p className="mt-2">
          Reexecutar a varredura processa só faixas sem selo. Sem letra no Genius = sem selo.
        </p>
      </section>
    </div>
  );
}
