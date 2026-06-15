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

function suporteColCount(showPlayer: boolean, showContatos: boolean): number {
  return 5 + (showPlayer ? 5 : 0) + (showContatos ? 4 : 0);
}

const BLOCK_DIVIDER =
  "border-l-2 border-slate-200/90 pl-2 dark:border-slate-600/80";

function BlockColumnToggle({
  active = false,
  onClick,
  label,
  alwaysOn,
}: {
  active?: boolean;
  onClick?: () => void;
  label: string;
  alwaysOn?: boolean;
}) {
  if (alwaysOn) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-600">
        <span className="text-emerald-600" aria-hidden>
          ●
        </span>
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all " +
        (active ?
          "bg-white text-fuchsia-800 shadow-sm ring-1 ring-fuchsia-200 dark:bg-slate-900 dark:text-fuchsia-200 dark:ring-fuchsia-800/60"
        : "text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200")
      }
    >
      <span
        className={active ? "text-fuchsia-500" : "text-slate-300 dark:text-slate-600"}
        aria-hidden
      >
        {active ? "●" : "○"}
      </span>
      {label}
    </button>
  );
}

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

function IdCell({
  id,
  label,
  variant,
}: {
  id: number | null;
  label: string;
  variant: "pdv" | "cliente";
}) {
  const trimmed = id != null ? String(id) : "";
  const display = trimmed || "—";
  const colorClass =
    variant === "pdv" ?
      "font-mono text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
    : "font-mono text-[11px] font-bold tabular-nums text-sky-700 dark:text-sky-400";

  return (
    <div className="flex items-center gap-0.5 whitespace-nowrap">
      <span className={colorClass}>{display}</span>
      {trimmed ?
        <CopyTextButton size="compact" variant="icon" text={trimmed} label={label} />
      : null}
    </div>
  );
}

function PdvRow({
  row,
  showPlayerBlock,
  showContatosBlock,
}: {
  row: SuportePdvRow;
  showPlayerBlock: boolean;
  showContatosBlock: boolean;
}) {
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
      <td className="w-[4.5rem] whitespace-nowrap px-1.5 py-2 align-top">
        <IdCell id={row.painelPdvId} label="Copiar ID do PDV no painel" variant="pdv" />
      </td>
      <td className="min-w-[9rem] max-w-[14rem] px-2 py-2 align-top">
        <div className="font-semibold text-slate-800 dark:text-slate-100">
          <CopyableCell text={row.nome} label="Copiar nome do PDV" />
        </div>
        {row.semPing5Dias ?
          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            Sem ping 5d+
          </span>
        : null}
      </td>
      <td className="whitespace-nowrap px-2 py-2 align-top">
        <CopyableCell
          text={displayBrazilianTaxId(row.cnpj)}
          label="Copiar CNPJ do PDV"
          mono
        />
      </td>
      <td className="w-[4.5rem] whitespace-nowrap px-1.5 py-2 align-top">
        <IdCell
          id={row.painelClienteId}
          label="Copiar ID do cliente no painel"
          variant="cliente"
        />
      </td>
      <td className="min-w-[8rem] max-w-[12rem] px-2 py-2 align-top">
        <CopyableCell text={row.clienteNome} label="Copiar nome do cliente" />
      </td>
      {showPlayerBlock ?
        <>
          <td className={"px-2 py-2 align-top " + BLOCK_DIVIDER}>
            <DownloadBar percent={row.telemetry.downloadPercent} />
          </td>
          <td className="px-2 py-2 align-top text-slate-700 dark:text-slate-300">
            {row.programacaoMusical}
          </td>
          <td className="px-2 py-2 align-top text-slate-500">{row.playerVersion ?? "—"}</td>
          <td className="whitespace-nowrap px-2 py-2 align-top text-slate-500">
            {fmtPing(row.telemetry.firstPingAt)}
          </td>
          <td className="whitespace-nowrap px-2 py-2 align-top text-slate-500">
            {fmtPing(row.telemetry.lastPingAt)}
          </td>
        </>
      : null}
      {showContatosBlock ?
        <>
          <td className={"px-2 py-2 align-top " + BLOCK_DIVIDER}>
            <ContactCell value={row.contatoLojaNome} />
          </td>
          <td className="px-2 py-2 align-top">
            <ContactCell value={row.contatoLojaTelefone} href={telHref} />
          </td>
          <td className="px-2 py-2 align-top">
            <ContactCell
              value={row.contatoLojaEmail}
              href={mailHref}
              copyLabel="Copiar e-mail da loja"
            />
          </td>
          <td className="px-2 py-2 align-top">
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
        </>
      : null}
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
  const [showPlayerBlock, setShowPlayerBlock] = useState(false);
  const [showContatosBlock, setShowContatosBlock] = useState(false);

  const colCount = suporteColCount(showPlayerBlock, showContatosBlock);
  const hasExtraColumns = showPlayerBlock || showContatosBlock;

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
    <div className="min-w-0 w-full py-4">
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

      <section className="min-w-0 rounded-xl border border-slate-200 bg-[#faf8f5] shadow-sm dark:border-slate-700 dark:bg-slate-900">
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

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-white/60 px-4 py-2 dark:border-slate-700 dark:bg-slate-900/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Blocos
          </span>
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/90 bg-slate-100/70 p-0.5 dark:border-slate-600 dark:bg-slate-800/50">
            <BlockColumnToggle alwaysOn label="Identificação" />
            <BlockColumnToggle
              active={showPlayerBlock}
              label="Player & cache"
              onClick={() => setShowPlayerBlock((v) => !v)}
            />
            <BlockColumnToggle
              active={showContatosBlock}
              label="Contatos"
              onClick={() => setShowContatosBlock((v) => !v)}
            />
          </div>
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-500 underline-offset-2 hover:text-fuchsia-700 hover:underline dark:text-slate-400 dark:hover:text-fuchsia-300"
            onClick={() => {
              setShowPlayerBlock(true);
              setShowContatosBlock(true);
            }}
          >
            Abrir tudo
          </button>
          <span className="text-slate-300 dark:text-slate-600" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-400"
            onClick={() => {
              setShowPlayerBlock(false);
              setShowContatosBlock(false);
            }}
          >
            Só identificação
          </button>
        </div>

        <div
          className={
            "suporte-table-scroll w-full max-w-full overflow-x-scroll overscroll-x-contain [-webkit-overflow-scrolling:touch] " +
            (hasExtraColumns ?
              "border-b border-slate-100 dark:border-slate-800"
            : "")
          }
        >
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead className="bg-[#f5f0e8] text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95">
              <tr className="text-[9px] font-semibold normal-case tracking-normal text-slate-400">
                <th colSpan={5} className="px-2 pb-0 pt-2 text-left">
                  Identificação
                </th>
                {showPlayerBlock ?
                  <th colSpan={5} className={"px-2 pb-0 pt-2 text-left " + BLOCK_DIVIDER}>
                    Player & cache
                  </th>
                : null}
                {showContatosBlock ?
                  <th colSpan={4} className={"px-2 pb-0 pt-2 text-left " + BLOCK_DIVIDER}>
                    Contatos
                  </th>
                : null}
              </tr>
              <tr>
                <th className="w-[4.5rem] px-1.5 py-2 text-center" title="ID PDV no painel legado">
                  ID PDV
                </th>
                <th className="min-w-[9rem] px-2 py-2">PDV</th>
                <th className="whitespace-nowrap px-2 py-2">CNPJ PDV</th>
                <th className="w-[4.5rem] px-1.5 py-2 text-center" title="ID cliente no painel legado">
                  ID cli.
                </th>
                <th className="min-w-[8rem] px-2 py-2">Cliente</th>
                {showPlayerBlock ?
                  <>
                    <th className={"whitespace-nowrap px-2 py-2 " + BLOCK_DIVIDER}>Cache</th>
                    <th className="px-2 py-2">Programação</th>
                    <th className="whitespace-nowrap px-2 py-2">Versão player</th>
                    <th className="whitespace-nowrap px-2 py-2">1º ping</th>
                    <th className="whitespace-nowrap px-2 py-2">Último ping</th>
                  </>
                : null}
                {showContatosBlock ?
                  <>
                    <th className={"px-2 py-2 " + BLOCK_DIVIDER}>Contato loja</th>
                    <th className="px-2 py-2">Telefone</th>
                    <th className="px-2 py-2">E-mail</th>
                    <th className="px-2 py-2">Maps</th>
                  </>
                : null}
              </tr>
            </thead>
            <tbody>
              {busy && !data ?
                <tr>
                  <td colSpan={colCount} className="px-4 py-6 text-sm text-slate-500">
                    Carregando…
                  </td>
                </tr>
              : filtered.length === 0 ?
                <tr>
                  <td colSpan={colCount} className="px-4 py-6 text-sm text-slate-500">
                    Nenhum PDV encontrado.
                  </td>
                </tr>
              : visible.map((row) => (
                  <PdvRow
                    key={row.rioPdvKey}
                    row={row}
                    showPlayerBlock={showPlayerBlock}
                    showContatosBlock={showContatosBlock}
                  />
                ))}
            </tbody>
          </table>
        </div>

        {hasExtraColumns ?
          <p className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-1.5 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-900/30">
            <span aria-hidden>↔</span>
            Deslize horizontalmente para ver todas as colunas abertas
          </p>
        : null}

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
