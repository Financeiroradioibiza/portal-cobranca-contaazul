"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ServidoresStatus } from "@/lib/infra/servidorStatusService";

function b2ErrorHint(raw: string): string {
  if (/not valid|InvalidAccessKeyId/i.test(raw)) {
    return "A Backblaze não reconhece o keyID no servidor — a Application Key foi apagada, copiada errada ou não é a key do bucket. Crie uma Application Key nova no painel B2 e envie keyID + applicationKey para atualizarmos o cloud2.";
  }
  if (/InvalidSecret|SignatureDoesNotMatch/i.test(raw)) {
    return "O applicationKey (secret) não bate com o keyID — copie de novo os dois campos na mesma hora em que a Backblaze mostra.";
  }
  return raw;
}

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

function formatDayLabel(isoDay: string): string {
  const [, m, d] = isoDay.split("-");
  return `${d}/${m}`;
}

function DailyBarChart({
  title,
  subtitle,
  points,
  valueKey,
  maxValue,
  formatValue,
  emptyHint,
}: {
  title: string;
  subtitle?: string;
  points: { day: string; [k: string]: string | number }[];
  valueKey: string;
  maxValue?: number;
  formatValue?: (v: number) => string;
  emptyHint?: string;
}) {
  const values = points.map((p) => Number(p[valueKey]) || 0);
  const max = maxValue ?? Math.max(1, ...values);
  const showEvery = points.length > 20 ? 5 : points.length > 14 ? 3 : 1;

  return (
    <div>
      <p className="text-sm font-bold">{title}</p>
      {subtitle ?
        <p className="mb-2 text-[11px] text-slate-500">{subtitle}</p>
      : null}
      {points.length === 0 || values.every((v) => v === 0) ?
        <p className="text-xs text-slate-500">{emptyHint ?? "Sem dados no período."}</p>
      : <>
          <div className="flex h-28 items-end gap-px sm:gap-0.5" role="img" aria-label={title}>
            {points.map((p) => {
              const v = Number(p[valueKey]) || 0;
              const h = max > 0 ? Math.max(v > 0 ? 4 : 0, (v / max) * 100) : 0;
              return (
                <div
                  key={p.day}
                  className="group relative flex h-28 min-w-0 flex-1 flex-col justify-end"
                  title={`${formatDayLabel(p.day)}: ${formatValue ? formatValue(v) : v}`}
                >
                  <div
                    className="mx-auto w-full max-w-[10px] rounded-t bg-sky-500/80 transition group-hover:bg-sky-600 dark:bg-sky-600"
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-400">
            {points.map((p, i) =>
              i % showEvery === 0 || i === points.length - 1 ?
                <span key={p.day}>{formatDayLabel(p.day)}</span>
              : null,
            )}
          </div>
        </>
      }
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
            Espaço, carga da VM e fila de processamento. Gráficos usam o Neon (faixas/dia) e amostras
            ao abrir esta página (disco — ~1× por hora).
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
        {status ?
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">Capacidade cloud2 (agora)</h2>
                <p
                  className={`mt-1 text-sm ${
                    status.capacity.level === "critical" ? "text-red-700 dark:text-red-300"
                    : status.capacity.level === "warn" ? "text-amber-800 dark:text-amber-200"
                    : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {status.capacity.message}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  status.capacity.level === "critical" ?
                    "bg-red-100 text-red-800"
                  : status.capacity.level === "warn" ?
                    "bg-amber-100 text-amber-900"
                  : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {status.capacity.level === "critical" ?
                  "Crítico"
                : status.capacity.level === "warn" ?
                  "Atenção"
                : "Ok"}
              </span>
            </div>
            <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">CPU (load ÷ núcleos)</dt>
                <dd className="font-semibold">
                  {status.cloud2.system ?
                    `${status.cloud2.system.loadPercent}% · load ${status.cloud2.system.load1.toFixed(2)} / ${status.cloud2.system.cpuCount} núcleos`
                  : disk ?
                    `${disk.usedPercent}% disco (CPU após deploy ops no cloud2)`
                  : "—"}
                </dd>
                {status.cloud2.system ?
                  <UsageBar usedPercent={status.cloud2.system.loadPercent} />
                : null}
              </div>
              <div>
                <dt className="text-xs text-slate-500">Disco NVMe</dt>
                <dd className="font-semibold">{disk ? `${disk.usedPercent}%` : "—"}</dd>
                {disk ?
                  <UsageBar usedPercent={disk.usedPercent} />
                : null}
              </div>
              <div>
                <dt className="text-xs text-slate-500">Fila processamento</dt>
                <dd>
                  {status.capacity.filaProcessando} processando · {status.capacity.filaAguardando}{" "}
                  aguardando
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Faixas concluídas (total)</dt>
                <dd>{status.capacity.faixasConcluidasTotal.toLocaleString("pt-BR")}</dd>
              </div>
            </dl>
            <div className="grid gap-6 border-t border-slate-100 pt-4 dark:border-slate-800 lg:grid-cols-2">
              <DailyBarChart
                title="Processamento — faixas concluídas por dia"
                subtitle="Últimos 30 dias (Neon, fuso São Paulo)"
                points={status.charts.faixasConcluidasPorDia}
                valueKey="count"
                formatValue={(v) => `${v} faixa${v === 1 ? "" : "s"}`}
              />
              <DailyBarChart
                title="Disco NVMe — % usado (amostras)"
                subtitle="Pontos ao abrir Servidores (~1 amostra/hora); precisa deploy ops com CPU no cloud2"
                points={status.charts.discoUsadoPorDia.map((p) => ({
                  day: p.day,
                  usedPercent: p.usedPercent,
                }))}
                valueKey="usedPercent"
                maxValue={100}
                formatValue={(v) => `${v}%`}
                emptyHint="Ainda sem histórico — volte aqui depois de algumas visitas ou após migrate servidor_cloud2_snapshot."
              />
            </div>
          </section>
        : null}

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
          subtitle={
            r2?.bucket ?
              `Opcional · bucket ${r2.bucket} — cópia quente das versões 128 mono`
            : "Opcional — backup Cloudflare das versões de uso (não é o B2 nem o disco do player)"
          }
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
              : !r2.enabled ?
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  <strong>Offline é esperado</strong> se você não configurou R2 no cloud2 — o player
                  toca a partir do disco NVMe (<code className="text-[11px]">uso/</code>). R2 só
                  espelha opcionalmente o 128 mono/.rib. Para ativar:{" "}
                  <code className="text-[11px]">R2_ENDPOINT</code>,{" "}
                  <code className="text-[11px]">R2_BUCKET</code>,{" "}
                  <code className="text-[11px]">R2_ACCESS_KEY_ID</code>,{" "}
                  <code className="text-[11px]">R2_SECRET_ACCESS_KEY</code> no{" "}
                  <code className="text-[11px]">/opt/portal-ibiza/infra/.env</code> (api + worker).
                  Ver <code className="text-[11px]">docs/CLOUD2-ENV-OBRIGATORIO.md</code>.
                </p>
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
            subtitle={
              status.cloud2.ops.b2.bucket ?
                `Bucket ${status.cloud2.ops.b2.bucket}${status.cloud2.ops.b2.prefix ? ` · prefixo ${status.cloud2.ops.b2.prefix}` : ""}`
              : "Masters 192k (frio)"
            }
            active={status.cloud2.ops.b2.enabled && !status.cloud2.ops.b2.error}
          >
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Objetos (amostra S3)</dt>
                <dd>
                  {status.cloud2.ops.b2.enabled && !status.cloud2.ops.b2.error ?
                    status.cloud2.ops.b2.objectCount.toLocaleString("pt-BR")
                  : "—"}
                  {status.cloud2.ops.b2.truncated ?
                    <span className="ml-1 text-amber-700 dark:text-amber-300">(parcial)</span>
                  : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Espaço estimado (listagem)</dt>
                <dd>
                  {status.cloud2.ops.b2.enabled && !status.cloud2.ops.b2.error ?
                    fmtBytes(status.cloud2.ops.b2.totalBytes)
                  : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Masters no Neon (chave B2)</dt>
                <dd>{status.neon.b2MastersCount.toLocaleString("pt-BR")} faixa(s)</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Masters só disco (local:)</dt>
                <dd>{status.neon.localMastersCount.toLocaleString("pt-BR")} faixa(s)</dd>
              </div>
            </dl>
            {status.cloud2.ops.b2.error ?
              <p className="mt-2 text-xs text-red-600">
                {b2ErrorHint(status.cloud2.ops.b2.error)}
                <span className="mt-1 block text-[10px] text-slate-500">
                  Detalhe técnico: {status.cloud2.ops.b2.error}
                </span>
              </p>
            : null}
            {!status.cloud2.ops.b2.enabled ?
              <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <p>
                  O painel lê o B2 pelo container <strong>api</strong> do cloud2 (
                  <code className="text-[10px]">GET /criacao/ops/storage</code>), não só pelo
                  worker-audio. Falta variável no <strong>api</strong>:
                </p>
                {(status.cloud2.ops.b2.missingEnv?.length ?? 0) > 0 ?
                  <ul className="list-disc pl-4">
                    {status.cloud2.ops.b2.missingEnv!.map((v) => (
                      <li key={v}>
                        <code className="text-[10px]">{v}</code>
                      </li>
                    ))}
                  </ul>
                : (
                  <ul className="list-disc pl-4">
                    <li>
                      <code className="text-[10px]">B2_S3_ENDPOINT</code> (ex.{" "}
                      <code className="text-[10px]">https://s3.us-west-002.backblazeb2.com</code>)
                    </li>
                    <li>
                      <code className="text-[10px]">B2_BUCKET</code>,{" "}
                      <code className="text-[10px]">B2_KEY_ID</code>,{" "}
                      <code className="text-[10px]">B2_APPLICATION_KEY</code>
                    </li>
                    <li>
                      <code className="text-[10px]">B2_REGION=us-west-002</code> (região do bucket)
                    </li>
                  </ul>
                )}
                <p>
                  No Envyron: mesmo <code className="text-[10px]">.env</code> do worker em{" "}
                  <code className="text-[10px]">api</code> e{" "}
                  <code className="text-[10px]">worker-audio</code>, depois{" "}
                  <code className="text-[10px]">docker compose up -d api</code>. No Netlify,{" "}
                  <code className="text-[10px]">CRIACAO_INGEST_SECRET</code> já deve estar ok para
                  chamar o cloud2.
                </p>
              </div>
            : null}
          </ServerCard>
        : null}

        {status?.cloud2.ops.b2Uso ?
          <ServerCard
            title="Backblaze B2 (128 mono cliente)"
            subtitle={
              status.cloud2.ops.b2Uso.bucket ?
                `Bucket ${status.cloud2.ops.b2Uso.bucket}${status.cloud2.ops.b2Uso.prefix ? ` · prefixo ${status.cloud2.ops.b2Uso.prefix}` : ""}`
              : "Versão de uso no B2"
            }
            active={status.cloud2.ops.b2Uso.enabled && !status.cloud2.ops.b2Uso.error}
          >
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Objetos (amostra S3)</dt>
                <dd>
                  {status.cloud2.ops.b2Uso.enabled && !status.cloud2.ops.b2Uso.error ?
                    status.cloud2.ops.b2Uso.objectCount.toLocaleString("pt-BR")
                  : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Versões Neon (chave b2:)</dt>
                <dd>{status.neon.b2UsoVersoesCount.toLocaleString("pt-BR")} registro(s)</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">
              Auditar: <code className="text-[10px]">npm run criacao:audit-b2</code> (após deploy
              cloud2 com /ops/b2-audit).
            </p>
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
