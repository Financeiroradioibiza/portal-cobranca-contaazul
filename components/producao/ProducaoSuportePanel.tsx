"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyTextButton } from "@/components/CopyTextButton";
import { matchesSuporteSearch } from "@/lib/cadastros/producaoSuporteSearch";
import type {
  ProducaoSuportePayload,
  SuportePdvRow,
} from "@/lib/cadastros/producaoSuporteTypes";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { displayBrazilianTaxId } from "@/lib/format";
import {
  currentBrazilYearMonth,
  formatYearMonthLabel,
} from "@/lib/manualReminders/yearMonth";

const BATCH_OPTIONS = [20, 50, 100] as const;
const DEFAULT_BATCH = BATCH_OPTIONS[0];
type BatchSize = (typeof BATCH_OPTIONS)[number];

type MonthMeta = { id: string; yearMonth: number };
type ListFilter = "todos" | "sem_ping";

function fmtPing(iso: string | null): string {
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

function DownloadBar({ percent }: { percent: number | null }) {
  const p = percent ?? 0;
  const label = percent == null ? "—" : `${Math.round(p)}%`;
  return (
    <div className="min-w-[90px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-fuchsia-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  sub,
  subTone = "muted",
  icon,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  subTone?: "muted" | "good" | "warn" | "bad";
  icon: string;
  tone: "green" | "blue" | "orange";
}) {
  const tones = {
    green: "bg-emerald-500",
    blue: "bg-sky-500",
    orange: "bg-amber-500",
  };
  const subColors = {
    muted: "text-slate-500",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-white " +
            tones[tone]
          }
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className={"text-xs " + subColors[subTone]}>{sub}</p>
        </div>
      </div>
    </div>
  );
}

function BatchSizePicker({
  value,
  onChange,
}: {
  value: BatchSize;
  onChange: (size: BatchSize) => void;
}) {
  return (
    <div className="flex items-center gap-1.5" title="Quantos PDVs mostrar por vez">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Por vez
      </span>
      <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
        {BATCH_OPTIONS.map((size) => (
          <button
            key={size}
            type="button"
            className={
              "px-2 py-1 text-[11px] font-semibold transition-colors " +
              (value === size ?
                "bg-fuchsia-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900")
            }
            onClick={() => onChange(size)}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}

function CopyableCell({
  text,
  label,
  mono = false,
  className = "",
}: {
  text: string;
  label: string;
  mono?: boolean;
  className?: string;
}) {
  const trimmed = text.trim();
  const display = trimmed || "—";
  return (
    <div className={"flex min-w-0 items-center gap-0.5 " + className}>
      <span
        className={
          mono ?
            "font-mono text-[10px] text-slate-500 dark:text-slate-400"
          : "min-w-0 truncate text-slate-700 dark:text-slate-200"
        }
        title={display !== "—" ? display : undefined}
      >
        {display}
      </span>
      {trimmed ?
        <CopyTextButton size="compact" variant="icon" text={trimmed} label={label} />
      : null}
    </div>
  );
}

function ContactCell({ value, href, copyLabel }: { value: string; href?: string; copyLabel?: string }) {
  const text = value.trim() || "—";
  const trimmed = value.trim();
  const content =
    !trimmed || !href ?
      <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{text}</span>
    : <a
        href={href}
        className="min-w-0 truncate text-sky-700 hover:underline dark:text-sky-400"
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        {text}
      </a>;

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {content}
      {trimmed && copyLabel ?
        <CopyTextButton size="compact" variant="icon" text={trimmed} label={copyLabel} />
      : null}
    </div>
  );
}

function IdCell({ id, label }: { id: number | null; label: string }) {
  const text = id != null ? String(id) : "";
  return (
    <CopyableCell
      text={text}
      label={label}
      mono
      className="max-w-[4.5rem] justify-end"
    />
  );
}

function PdvRow({ row }: { row: SuportePdvRow }) {
  const telHref =
    row.contatoLojaTelefone ?
      `tel:${row.contatoLojaTelefone.replace(/\s/g, "")}`
    : undefined;
  const mailHref =
    row.contatoLojaEmail ? `mailto:${row.contatoLojaEmail.split(/[,;]/)[0]?.trim()}` : undefined;

  return (
    <tr
      className={
        "border-b border-slate-100 dark:border-slate-800 " +
        (row.semPing5Dias ?
          "bg-rose-50/70 dark:bg-rose-950/20"
        : "hover:bg-white/80 dark:hover:bg-slate-900/50")
      }
    >
      <td className="px-3 py-2 align-top">
        <div className="font-semibold text-slate-800 dark:text-slate-100">
          <CopyableCell text={row.nome} label="Copiar nome do PDV" />
        </div>
        {row.semPing5Dias ?
          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            Sem ping 5d+
          </span>
        : null}
      </td>
      <td className="w-[4.75rem] whitespace-nowrap px-1 py-2 align-top">
        <IdCell id={row.painelPdvId} label="Copiar ID do PDV no painel" />
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top">
        <CopyableCell
          text={displayBrazilianTaxId(row.cnpj)}
          label="Copiar CNPJ do PDV"
          mono
        />
      </td>
      <td className="px-3 py-2 align-top">
        <CopyableCell text={row.clienteNome} label="Copiar nome do cliente" />
      </td>
      <td className="w-[4.75rem] whitespace-nowrap px-1 py-2 align-top">
        <IdCell id={row.painelClienteId} label="Copiar ID do cliente no painel" />
      </td>
      <td className="px-3 py-2 align-top">
        <DownloadBar percent={row.telemetry.downloadPercent} />
      </td>
      <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
        {row.programacaoMusical}
      </td>
      <td className="px-3 py-2 align-top text-slate-500">{row.playerVersion ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-slate-500">
        {fmtPing(row.telemetry.firstPingAt)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-slate-500">
        {fmtPing(row.telemetry.lastPingAt)}
      </td>
      <td className="px-3 py-2 align-top">
        <ContactCell value={row.contatoLojaNome} />
      </td>
      <td className="px-3 py-2 align-top">
        <ContactCell value={row.contatoLojaTelefone} href={telHref} />
      </td>
      <td className="px-3 py-2 align-top">
        <ContactCell value={row.contatoLojaEmail} href={mailHref} copyLabel="Copiar e-mail da loja" />
      </td>
      <td className="px-3 py-2 align-top">
        {row.googleMapsUrl ?
          <a
            href={row.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-sky-950/40"
            title={row.googleMapsQuery || "Abrir no Google Maps"}
          >
            Maps
          </a>
        : <span className="text-slate-400">—</span>}
      </td>
    </tr>
  );
}

export function ProducaoSuportePanel() {
  const todayYm = useMemo(() => currentBrazilYearMonth(), []);
  const [months, setMonths] = useState<MonthMeta[]>([]);
  const vigenteYm = useMemo(
    () => pickVigenteRioYearMonth(months, todayYm),
    [months, todayYm],
  );
  const [data, setData] = useState<ProducaoSuportePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todos");
  const [batchSize, setBatchSize] = useState<BatchSize>(DEFAULT_BATCH);
  const [visibleCount, setVisibleCount] = useState<number>(DEFAULT_BATCH);

  const load = useCallback(async (ym: number) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/producao/suporte?ym=${ym}`);
      const json = (await res.json()) as ProducaoSuportePayload & { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setData(json);
      setVisibleCount(DEFAULT_BATCH);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar suporte.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/rio-planilha/clientes/months")
      .then((r) => r.json())
      .then((d: { months?: MonthMeta[] }) => {
        setMonths(d.months ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void load(vigenteYm);
  }, [vigenteYm, load]);

  useEffect(() => {
    setVisibleCount((prev) => Math.max(batchSize, prev));
  }, [batchSize]);

  const filtered = useMemo(() => {
    const list = data?.pdvs ?? [];
    return list.filter((row) => {
      if (listFilter === "sem_ping" && !row.semPing5Dias) return false;
      return matchesSuporteSearch(row, q);
    });
  }, [data?.pdvs, listFilter, q]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;
  const ov = data?.overview;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Suporte</p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dashboard do suporte
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Visão rápida de PDVs sem conexão e contatos da loja
          </p>
        </div>
        <span
          className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-semibold text-violet-900 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100"
          title="Usa a competência vigente da Planilha Rio"
        >
          Vigente: {formatYearMonthLabel(vigenteYm)}
        </span>
      </header>

      {msg ?
        <p className="mb-3 text-sm text-rose-700 dark:text-rose-400">{msg}</p>
      : null}

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <OverviewCard
          title="PDVs"
          value={String(ov?.totalPdvs ?? "—")}
          sub="Base cadastro produção"
          icon="📻"
          tone="green"
        />
        <OverviewCard
          title="Sem ping 5 dias"
          value={String(ov?.semPing5Dias ?? "—")}
          sub={
            ov && ov.semPing5Dias > 0 ?
              "Player ativo sem ping recente"
            : "Nenhum alerta no momento"
          }
          subTone={ov && ov.semPing5Dias > 0 ? "bad" : "good"}
          icon="⚠️"
          tone="orange"
        />
        <OverviewCard
          title="Chamados abertos"
          value="—"
          sub="Módulo em breve"
          icon="🎫"
          tone="blue"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-[#faf8f5] shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#f5f0e8] px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={
                "rounded px-2.5 py-1 text-[11px] font-semibold " +
                (listFilter === "todos" ?
                  "bg-fuchsia-700 text-white dark:bg-fuchsia-600"
                : "border border-slate-300 text-slate-600 dark:border-slate-600")
              }
              onClick={() => {
                setListFilter("todos");
                setVisibleCount(batchSize);
              }}
            >
              Todos ({data?.pdvs.length ?? 0})
            </button>
            <button
              type="button"
              className={
                "rounded px-2.5 py-1 text-[11px] font-semibold " +
                (listFilter === "sem_ping" ?
                  "bg-rose-600 text-white"
                : "border border-slate-300 text-slate-600 dark:border-slate-600")
              }
              onClick={() => {
                setListFilter("sem_ping");
                setVisibleCount(batchSize);
              }}
            >
              Sem ping 5d ({ov?.semPing5Dias ?? 0})
            </button>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <BatchSizePicker value={batchSize} onChange={setBatchSize} />
            <input
              type="search"
              placeholder="CNPJ, PDV, cliente ou ID…"
              className="min-w-[200px] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisibleCount(batchSize);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f5f0e8] text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95">
              <tr>
                <th className="px-3 py-2">PDV</th>
                <th className="w-[4.75rem] px-1 py-2 text-center" title="ID PDV no painel legado">
                  ID PDV
                </th>
                <th className="px-3 py-2">CNPJ PDV</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="w-[4.75rem] px-1 py-2 text-center" title="ID cliente no painel legado">
                  ID cli.
                </th>
                <th className="px-3 py-2">Cache</th>
                <th className="px-3 py-2">Programação</th>
                <th className="px-3 py-2">Versão player</th>
                <th className="px-3 py-2">1º ping</th>
                <th className="px-3 py-2">Último ping</th>
                <th className="px-3 py-2">Contato loja</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Maps</th>
              </tr>
            </thead>
            <tbody>
              {busy && !data ?
                <tr>
                  <td colSpan={14} className="px-4 py-6 text-sm text-slate-500">
                    Carregando…
                  </td>
                </tr>
              : filtered.length === 0 ?
                <tr>
                  <td colSpan={14} className="px-4 py-6 text-sm text-slate-500">
                    Nenhum PDV encontrado.
                  </td>
                </tr>
              : visible.map((row) => <PdvRow key={row.rioPdvKey} row={row} />)}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 ?
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <span className="text-[11px] text-slate-500">
              Mostrando {visible.length} de {filtered.length} PDVs · ordenados por instalação
              (mais recentes)
            </span>
            {remaining > 0 ?
              <button
                type="button"
                className="rounded border border-fuchsia-300 px-2 py-1 text-[11px] font-semibold text-fuchsia-800 dark:border-fuchsia-700 dark:text-fuchsia-200"
                onClick={() => setVisibleCount((n) => Math.min(n + batchSize, filtered.length))}
              >
                Mostrar mais ({Math.min(batchSize, remaining)} de {remaining})
              </button>
            : null}
            {visibleCount > batchSize ?
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-600"
                onClick={() => setVisibleCount(batchSize)}
              >
                Recolher lista
              </button>
            : null}
          </div>
        : null}

        <p className="border-t border-dashed border-amber-200 bg-amber-50/80 px-4 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Ordem: últimos cadastros/instalações primeiro. Busca aceita CNPJ com ou sem máscara, nome
          do PDV ou do cliente, ou ID numérico do painel. Google Maps usa nome + endereço + bairro
          (igual Consulta Painel).
        </p>
      </section>
    </div>
  );
}
