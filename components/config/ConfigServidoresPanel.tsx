"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ServidoresStatus } from "@/lib/infra/servidorStatusService";

function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      title={ok ? "Ativo" : "Indisponível"}
    />
  );
}

function UsageBar({ usedPercent }: { usedPercent: number }) {
  const tone =
    usedPercent >= 90 ? "bg-red-500"
    : usedPercent >= 75 ? "bg-amber-500"
    : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, usedPercent)}%` }} />
    </div>
  );
}

function ServerCard({
  title,
  subtitle,
  active,
  children,
}: {
  title: string;
  subtitle?: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot ok={active} />
            <h2 className="text-base font-bold">{title}</h2>
          </div>
          {subtitle ?
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          : null}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            active ?
              "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {active ? "Ativo" : "Offline"}
        </span>
      </div>
      {children}
    </section>
  );
}

export function ConfigServidoresPanel() {
  const [status, setStatus] = useState<ServidoresStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/config/servidores");
      if (!res.ok) throw new Error("Falha ao carregar status.");
      const data = (await res.json()) as { status?: ServidoresStatus };
      setStatus(data.status ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disk = status?.cloud2.ops.disk;
  const r2 = status?.cloud2.ops.r2;
  const tempLimbo = status?.cloud2.ops.tempLimbo;

  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Configuração / Servidores
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Servidores</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Espaço e saúde do Cloud2 (NVMe) e do R2 (Cloudflare). Atualize a cada visita ou use
            Atualizar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600"
        >
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {err ?
        <p className="mb-4 text-sm text-red-600">{err}</p>
      : null}

      {status ?
        <p className="mb-4 text-[11px] text-slate-400">
          Coletado em {new Date(status.collectedAt).toLocaleString("pt-BR")}
        </p>
      : null}

      <div className="space-y-4">
        <ServerCard
          title="Cloud2 — API"
          subtitle={status?.cloud2.baseUrl}
          active={status?.cloud2.api.ok ?? false}
        >
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Latência</dt>
              <dd>{status?.cloud2.api.latencyMs != null ? `${status.cloud2.api.latencyMs} ms` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Serviço</dt>
              <dd>{String(status?.cloud2.api.data?.service ?? "—")}</dd>
            </div>
            {status?.cloud2.api.error ?
              <div className="sm:col-span-2 text-xs text-red-600">{status.cloud2.api.error}</div>
            : null}
          </dl>
        </ServerCard>

        <ServerCard
          title="Cloud2 — Worker download"
          subtitle="Deemix / Spotizerr / YouTube"
          active={status?.cloud2.downloadWorker.ok ?? false}
        >
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Storage root</dt>
              <dd className="truncate font-mono text-xs">
                {String(status?.cloud2.downloadWorker.data?.storageRoot ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Providers</dt>
              <dd className="text-xs">
                Deemix {status?.cloud2.downloadWorker.data?.deemix ? "✓" : "✗"} · Spotizerr{" "}
                {status?.cloud2.downloadWorker.data?.spotizerr ? "✓" : "✗"} · YouTube{" "}
                {status?.cloud2.downloadWorker.data?.youtube ? "✓" : "✗"}
              </dd>
            </div>
            {status?.cloud2.downloadWorker.error ?
              <div className="sm:col-span-2 text-xs text-amber-700 dark:text-amber-300">
                {status.cloud2.downloadWorker.error}
              </div>
            : null}
          </dl>
        </ServerCard>

        <ServerCard
          title="Cloud2 — Disco NVMe"
          subtitle={disk?.path ?? status?.cloud2.ops.error ?? "Métricas via /criacao/ops/storage"}
          active={Boolean(disk)}
        >
          {disk ?
            <>
              <div className="mb-2 flex justify-between text-sm">
                <span>
                  {fmtBytes(disk.usedBytes)} usados · {fmtBytes(disk.freeBytes)} livres
                </span>
                <span className="font-semibold">{disk.usedPercent}%</span>
              </div>
              <UsageBar usedPercent={disk.usedPercent} />
              <p className="mt-1 text-xs text-slate-500">Total: {fmtBytes(disk.totalBytes)}</p>
              {(status?.cloud2.ops.dirs.length ?? 0) > 0 ?
                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  {status!.cloud2.ops.dirs.map((d) => (
                    <li key={d.name} className="flex justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">{d.name}/</span>
                      <span className="font-mono">{fmtBytes(d.bytes)}</span>
                    </li>
                  ))}
                </ul>
              : null}
            </>
          : <p className="text-sm text-amber-700 dark:text-amber-300">
              {status?.cloud2.ops.error ??
                "Disco indisponível — faça deploy da rota ops no cloud2 (scripts/sync-cloud2-to-portal-ibiza.sh)."}
            </p>
          }
        </ServerCard>

        <ServerCard
          title="Cloud2 — Limbo (temporários)"
          subtitle={
            tempLimbo?.available ?
              `Pastas upload/, download-staging/, work/ com mais de ${tempLimbo.limboDays} dia(s) sem uso`
            : tempLimbo?.error ?? "Métricas via /criacao/ops/orphans"
          }
          active={Boolean(tempLimbo?.available)}
        >
          {tempLimbo?.available ?
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Tamanho estimado</dt>
                  <dd className="text-lg font-semibold">
                    {fmtBytes(tempLimbo.totalBytesEstimate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Itens no limbo</dt>
                  <dd>
                    {tempLimbo.totalEntries.toLocaleString("pt-BR")}
                    {tempLimbo.totalEntries > 0 ?
                      <span className="ml-1 text-amber-700 dark:text-amber-300">(revisar)</span>
                    : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Limiar (dias)</dt>
                  <dd>{tempLimbo.limboDays}</dd>
                </div>
              </dl>
              {tempLimbo.warnings.length > 0 ?
                <ul className="mt-2 list-disc pl-4 text-xs text-amber-700 dark:text-amber-300">
                  {tempLimbo.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              : null}
              {tempLimbo.entries.length > 0 ?
                <ul className="mt-3 max-h-48 space-y-1 overflow-auto border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  {tempLimbo.entries.slice(0, 40).map((e) => (
                    <li key={`${e.bucket}/${e.name}`} className="flex justify-between gap-2">
                      <span className="truncate text-slate-600 dark:text-slate-300">
                        {e.bucket}/{e.name}
                        <span className="text-slate-400"> · {e.ageDays}d</span>
                      </span>
                      <span className="shrink-0 font-mono">{fmtBytes(e.sizeBytes)}</span>
                    </li>
                  ))}
                  {tempLimbo.entries.length > 40 ?
                    <li className="text-slate-400">
                      +{tempLimbo.entries.length - 40} item(ns)…
                    </li>
                  : null}
                </ul>
              : (
                <p className="mt-2 text-xs text-slate-500">
                  Nenhuma pasta temporária acima do limiar — bom sinal.
                </p>
              )}
            </>
          : <p className="text-sm text-amber-700 dark:text-amber-300">
              {tempLimbo?.error ??
                "Limbo indisponível — faça deploy de /criacao/ops/orphans no cloud2."}
            </p>
          }
        </ServerCard>

        <ServerCard
          title="Cloudflare R2"
          subtitle={r2?.bucket ? `Bucket ${r2.bucket}` : "Backup quente + staging downloads"}
          active={Boolean(r2?.enabled && !r2?.error)}
        >
          {r2 ?
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Configurado</dt>
                  <dd>{r2.configured ? "Sim" : "Não (env R2_* no cloud2)"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Prefixo</dt>
                  <dd className="font-mono text-xs">{r2.prefix || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Objetos</dt>
                  <dd>
                    {r2.objectCount.toLocaleString("pt-BR")}
                    {r2.truncated ? " (amostra — bucket grande)" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Espaço estimado</dt>
                  <dd>{fmtBytes(r2.totalBytes)}</dd>
                </div>
              </dl>
              {r2.error ?
                <p className="mt-2 text-xs text-red-600">{r2.error}</p>
              : null}
            </>
          : <p className="text-sm text-slate-500">
              Métricas R2 vêm do cloud2 após deploy de /criacao/ops/storage.
            </p>
          }

          {status?.cloudflare.configured ?
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Analytics Cloudflare (30 dias)
              </p>
              {status.cloudflare.error ?
                <p className="text-xs text-amber-700">{status.cloudflare.error}</p>
              : status.cloudflare.r2Analytics ?
                <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px] dark:bg-slate-950">
                  {JSON.stringify(status.cloudflare.r2Analytics, null, 2)}
                </pre>
              : <p className="text-xs text-slate-500">Sem dados de analytics.</p>
              }
            </div>
          : <p className="mt-3 text-[11px] text-slate-400">
              Para tráfego/ops R2 na Cloudflare, configure{" "}
              <code className="text-[10px]">CLOUDFLARE_API_TOKEN</code> e{" "}
              <code className="text-[10px]">CLOUDFLARE_ACCOUNT_ID</code> no Netlify.
            </p>
          }
        </ServerCard>

        {status?.cloud2.ops.b2 ?
          <ServerCard
            title="Backblaze B2 (masters)"
            subtitle={`Bucket ${status.cloud2.ops.b2.bucket || "—"}`}
            active={status.cloud2.ops.b2.enabled && !status.cloud2.ops.b2.error}
          >
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Objetos (amostra)</dt>
                <dd>{status.cloud2.ops.b2.objectCount.toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Espaço estimado</dt>
                <dd>{fmtBytes(status.cloud2.ops.b2.totalBytes)}</dd>
              </div>
            </dl>
            {status.cloud2.ops.b2.error ?
              <p className="mt-2 text-xs text-red-600">{status.cloud2.ops.b2.error}</p>
            : null}
          </ServerCard>
        : null}

        <section className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <h2 className="text-sm font-bold">Neon — referência lógica</h2>
          <p className="mb-2 text-xs text-slate-500">
            Soma de <code className="text-[10px]">size_bytes</code> gravada no banco (não substitui
            medição real do disco/R2).
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Versões de uso</dt>
              <dd>
                {fmtBytes(status?.neon.versoesUsoBytes)} · {status?.neon.versoesCount ?? 0} registro(s)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Downloads (staging)</dt>
              <dd>{fmtBytes(status?.neon.downloadStagingBytes)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Itens com chave R2</dt>
              <dd>{status?.neon.downloadItemsR2 ?? 0}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
