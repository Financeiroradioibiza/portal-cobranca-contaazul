"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyTextButton } from "@/components/CopyTextButton";
import { RioTagCobrancaNome } from "@/components/rio/RioTagCobrancaNome";
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
type ViewMode = "pdv" | "cliente";

type SuporteClienteOption = {
  key: string;
  nome: string;
  tagCobranca: SuportePdvRow["tagCobranca"];
  painelClienteId: number | null;
  pdvCount: number;
  semPingCount: number;
};

function suporteColCount(
  showPlayer: boolean,
  showContatos: boolean,
  clienteMode: boolean,
): number {
  const identCols = clienteMode ? 3 : 5;
  return identCols + (showPlayer ? 5 : 0) + (showContatos ? 4 : 0);
}

function buildClienteOptions(pdvs: SuportePdvRow[]): SuporteClienteOption[] {
  const map = new Map<string, SuporteClienteOption>();
  for (const row of pdvs) {
    let opt = map.get(row.clienteKey);
    if (!opt) {
      opt = {
        key: row.clienteKey,
        nome: row.clienteNome,
        tagCobranca: row.clienteTagCobranca,
        painelClienteId: row.painelClienteId,
        pdvCount: 0,
        semPingCount: 0,
      };
      map.set(row.clienteKey, opt);
    }
    opt.pdvCount += 1;
    if (row.semPing5Dias) opt.semPingCount += 1;
    if (row.painelClienteId != null && opt.painelClienteId == null) {
      opt.painelClienteId = row.painelClienteId;
    }
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function ViewModePicker({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm dark:border-slate-600 dark:bg-slate-950"
      role="group"
      aria-label="Forma de visualização"
    >
      {(
        [
          { id: "pdv" as const, label: "PDV" },
          { id: "cliente" as const, label: "Cliente" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          className={
            "rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition-colors " +
            (value === opt.id ?
              "bg-slate-800 text-white shadow-sm dark:bg-slate-200 dark:text-slate-900"
            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900")
          }
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SuporteClientePickerDialog({
  open,
  clients,
  onClose,
  onSelect,
}: {
  open: boolean;
  clients: SuporteClienteOption[];
  onClose: () => void;
  onSelect: (clienteKey: string) => void;
}) {
  const dlgRef = useRef<HTMLDialogElement>(null);
  const [needle, setNeedle] = useState("");

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setNeedle("");
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = needle.trim().toLowerCase();
    if (!q) return clients;
    const digits = q.replace(/\D/g, "");
    return clients.filter((c) => {
      if (c.nome.toLowerCase().includes(q)) return true;
      if (digits && c.painelClienteId != null && String(c.painelClienteId).includes(digits)) {
        return true;
      }
      return false;
    });
  }, [clients, needle]);

  return (
    <dialog
      ref={dlgRef}
      className="w-[min(520px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Escolher cliente</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Busque pelo nome ou ID do painel. A lista mostra só PDVs da competência vigente.
        </p>
        <input
          type="search"
          autoFocus
          placeholder="Nome ou ID do cliente…"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
        />
      </div>
      <ul className="max-h-[min(420px,55vh)] overflow-y-auto py-1">
        {filtered.length === 0 ?
          <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum cliente encontrado.</li>
        : filtered.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sky-50 dark:hover:bg-sky-950/30"
                onClick={() => onSelect(c.key)}
              >
                <span className="font-mono text-[11px] font-bold tabular-nums text-sky-700 dark:text-sky-400">
                  {c.painelClienteId ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <RioTagCobrancaNome nome={c.nome} tag={c.tagCobranca} />
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {c.pdvCount} PDV{c.pdvCount === 1 ? "" : "s"}
                    {c.semPingCount > 0 ? ` · ${c.semPingCount} sem ping 5d+` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))
        }
      </ul>
      <div className="flex justify-end border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </dialog>
  );
}

function ClienteFocusHeader({
  cliente,
  pdvCount,
  semPingCount,
  onChangeCliente,
}: {
  cliente: SuporteClienteOption;
  pdvCount: number;
  semPingCount: number;
  onChangeCliente: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3 dark:border-sky-900/50 dark:from-sky-950/40 dark:to-slate-900">
      <IdCell
        id={cliente.painelClienteId}
        label="Copiar ID do cliente no painel"
        variant="cliente"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">
          <RioTagCobrancaNome nome={cliente.nome} tag={cliente.tagCobranca} />
        </p>
        <p className="text-[11px] text-slate-500">
          {pdvCount} PDV{pdvCount === 1 ? "" : "s"} nesta competência
          {semPingCount > 0 ?
            <span className="ms-1 font-semibold text-rose-600 dark:text-rose-400">
              · {semPingCount} sem ping 5d+
            </span>
          : null}
        </p>
      </div>
      <button
        type="button"
        className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200"
        onClick={onChangeCliente}
      >
        Trocar cliente
      </button>
    </div>
  );
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
  clienteMode,
}: {
  row: SuportePdvRow;
  showPlayerBlock: boolean;
  showContatosBlock: boolean;
  clienteMode: boolean;
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
          <RioTagCobrancaNome nome={row.nome} tag={row.tagCobranca} />
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
      {!clienteMode ?
        <>
          <td className="w-[4.5rem] whitespace-nowrap px-1.5 py-2 align-top">
            <IdCell
              id={row.painelClienteId}
              label="Copiar ID do cliente no painel"
              variant="cliente"
            />
          </td>
          <td className="min-w-[8rem] max-w-[12rem] px-2 py-2 align-top">
            <RioTagCobrancaNome nome={row.clienteNome} tag={row.clienteTagCobranca} />
          </td>
        </>
      : null}
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
  const [viewMode, setViewMode] = useState<ViewMode>("pdv");
  const [selectedClienteKey, setSelectedClienteKey] = useState<string | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const clienteMode = viewMode === "cliente" && Boolean(selectedClienteKey);
  const colCount = suporteColCount(showPlayerBlock, showContatosBlock, clienteMode);
  const identColSpan = clienteMode ? 3 : 5;
  const hasExtraColumns = showPlayerBlock || showContatosBlock;

  const clienteOptions = useMemo(
    () => buildClienteOptions(data?.pdvs ?? []),
    [data?.pdvs],
  );

  const selectedCliente = useMemo(
    () => clienteOptions.find((c) => c.key === selectedClienteKey) ?? null,
    [clienteOptions, selectedClienteKey],
  );

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
      if (viewMode === "cliente" && selectedClienteKey && row.clienteKey !== selectedClienteKey) {
        return false;
      }
      return matchesSuporteSearch(row, q);
    });
  }, [data?.pdvs, listFilter, q, viewMode, selectedClienteKey]);

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    setVisibleCount(batchSize);
    if (mode === "cliente") {
      setClientPickerOpen(true);
    } else {
      setClientPickerOpen(false);
    }
  }

  function handleClienteSelect(key: string) {
    setSelectedClienteKey(key);
    setClientPickerOpen(false);
    setVisibleCount(batchSize);
  }

  function handleClientPickerClose() {
    setClientPickerOpen(false);
    if (viewMode === "cliente" && !selectedClienteKey) {
      setViewMode("pdv");
    }
  }

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
            <ViewModePicker value={viewMode} onChange={handleViewModeChange} />
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

        {viewMode === "cliente" && selectedCliente ?
          <ClienteFocusHeader
            cliente={selectedCliente}
            pdvCount={filtered.length}
            semPingCount={filtered.filter((r) => r.semPing5Dias).length}
            onChangeCliente={() => setClientPickerOpen(true)}
          />
        : viewMode === "cliente" ?
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-sky-200 bg-sky-50/50 px-4 py-4 dark:border-sky-900/40 dark:bg-sky-950/20">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Escolha um cliente para ver só os PDVs dele.
            </p>
            <button
              type="button"
              className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 dark:bg-sky-600"
              onClick={() => setClientPickerOpen(true)}
            >
              Escolher cliente
            </button>
          </div>
        : null}

        <SuporteClientePickerDialog
          open={clientPickerOpen}
          clients={clienteOptions}
          onClose={handleClientPickerClose}
          onSelect={handleClienteSelect}
        />

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
          {viewMode === "cliente" && !selectedClienteKey ?
            null
          : <>
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead className="bg-[#f5f0e8] text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95">
              <tr className="text-[9px] font-semibold normal-case tracking-normal text-slate-400">
                <th colSpan={identColSpan} className="px-2 pb-0 pt-2 text-left">
                  {clienteMode ? "PDVs do cliente" : "Identificação"}
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
                {!clienteMode ?
                  <>
                    <th className="w-[4.5rem] px-1.5 py-2 text-center" title="ID cliente no painel legado">
                      ID cli.
                    </th>
                    <th className="min-w-[8rem] px-2 py-2">Cliente</th>
                  </>
                : null}
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
                    {viewMode === "cliente" && !selectedClienteKey ?
                      "Nenhum PDV — escolha um cliente acima."
                    : viewMode === "cliente" ?
                      "Nenhum PDV deste cliente com os filtros atuais."
                    : "Nenhum PDV encontrado."}
                  </td>
                </tr>
              : visible.map((row) => (
                  <PdvRow
                    key={row.rioPdvKey}
                    row={row}
                    showPlayerBlock={showPlayerBlock}
                    showContatosBlock={showContatosBlock}
                    clienteMode={clienteMode}
                  />
                ))}
            </tbody>
          </table>
          </>}
        </div>

        {hasExtraColumns ?
          <p className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-1.5 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-900/30">
            <span aria-hidden>↔</span>
            Deslize horizontalmente para ver todas as colunas abertas
          </p>
        : null}

        {filtered.length > 0 && !(viewMode === "cliente" && !selectedClienteKey) ?
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <span className="text-[11px] text-slate-500">
              {viewMode === "cliente" && selectedCliente ?
                `Cliente ${selectedCliente.nome} · ${visible.length} de ${filtered.length} PDVs`
              : `Mostrando ${visible.length} de ${filtered.length} PDVs · ordenados por instalação (mais recentes)`}
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
