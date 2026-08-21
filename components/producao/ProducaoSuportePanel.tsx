"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPlayerVersionLabel } from "@/lib/player/formatPlayerVersionLabel";
import { CopyTextButton } from "@/components/CopyTextButton";
import { RioTagCobrancaNome } from "@/components/rio/RioTagCobrancaNome";
import {
  effectiveRioTagCobranca,
  rioTagCobrancaRowBgClass,
} from "@/lib/rio/rioTagCobranca";
import { matchesSuporteSearch } from "@/lib/cadastros/producaoSuporteSearch";
import type {
  ProducaoSuportePayload,
  SuporteClienteCancelado,
  SuporteClienteSummary,
  SuportePdvRow,
} from "@/lib/cadastros/producaoSuporteTypes";
import { displayBrazilianTaxId } from "@/lib/format";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

const BATCH_OPTIONS = [20, 50, 100] as const;
const DEFAULT_BATCH = BATCH_OPTIONS[0];
type BatchSize = (typeof BATCH_OPTIONS)[number];

type ListFilter = "todos" | "sem_ping" | "instalados" | "sem_primeiro_ping";
type ViewMode = "pdv" | "cliente";

type SuporteClienteOption = {
  key: string;
  nome: string;
  tagCobranca: SuportePdvRow["tagCobranca"];
  portalClienteId: number | null;
  clienteLoginEmail: string | null;
  clienteLoginPassword: string | null;
  clienteLoginPending: boolean;
  pdvCount: number;
  semPingCount: number;
};

function suporteColCount(
  showIdentBlock: boolean,
  showPlayer: boolean,
  showContatos: boolean,
  clienteMode: boolean,
): number {
  const identCols =
    clienteMode ?
      showIdentBlock ? 4 : 1
    : showIdentBlock ? 6 : 1;
  const playerCols = showPlayer ? (clienteMode ? 5 : 6) : 0;
  return identCols + playerCols + (showContatos ? 4 : 0);
}

const STICKY_PDV_TH =
  "suporte-sticky-pdv min-w-[7rem] max-w-[9.5rem] border-r border-slate-200/90 bg-[#f5f0e8] px-2 py-1.5 dark:border-slate-600/80 dark:bg-slate-800/95";
const STICKY_PDV_TD = "suporte-sticky-pdv min-w-[7rem] max-w-[9.5rem] border-r border-slate-200/90 px-2 py-1.5 dark:border-slate-600/80";

function stickyPdvRowBg(tagBg: string | undefined, semPing: boolean): string {
  if (tagBg) return tagBg;
  if (semPing) return "bg-rose-50/70 dark:bg-rose-950/20";
  return "bg-[#faf8f5] dark:bg-slate-900";
}

const EMPTY_TELEMETRY: SuportePdvRow["telemetry"] = {
  playerVersion: null,
  downloadPercent: null,
  firstPingAt: null,
  lastPingAt: null,
  isOnline: null,
};

function ProgramacaoCriacaoCell({ nome }: { nome: string | null }) {
  if (nome) {
    return (
      <span className="font-medium text-emerald-800 dark:text-emerald-300" title="Amarração da Central de programações">
        {nome}
      </span>
    );
  }
  return <span className="text-slate-400">sem prog.</span>;
}

function summaryToClienteOption(c: SuporteClienteSummary): SuporteClienteOption {
  return {
    key: c.key,
    nome: c.nome,
    tagCobranca: c.tagCobranca,
    portalClienteId: c.portalClienteId,
    clienteLoginEmail: null,
    clienteLoginPassword: null,
    clienteLoginPending: false,
    pdvCount: c.pdvCount,
    semPingCount: c.semPingCount,
  };
}

function buildClienteOptionsFromRows(pdvs: SuportePdvRow[]): SuporteClienteOption[] {
  const map = new Map<string, SuporteClienteOption>();
  for (const row of pdvs) {
    let opt = map.get(row.clienteKey);
    if (!opt) {
      opt = {
        key: row.clienteKey,
        nome: row.clienteNome,
        tagCobranca: row.clienteTagCobranca,
        portalClienteId: row.portalClienteId,
        clienteLoginEmail: row.clienteLoginEmail,
        clienteLoginPassword: row.clienteLoginPassword,
        clienteLoginPending: row.clienteLoginPending,
        pdvCount: 0,
        semPingCount: 0,
      };
      map.set(row.clienteKey, opt);
    }
    opt.pdvCount += 1;
    if (row.semPing5Dias) opt.semPingCount += 1;
    if (row.portalClienteId != null && opt.portalClienteId == null) {
      opt.portalClienteId = row.portalClienteId;
    }
    if (!opt.clienteLoginEmail && row.clienteLoginEmail) {
      opt.clienteLoginEmail = row.clienteLoginEmail;
      opt.clienteLoginPassword = row.clienteLoginPassword;
      opt.clienteLoginPending = row.clienteLoginPending;
    }
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function ClienteLoginInfo({
  email,
  password,
  pending,
  compact = false,
  field = "both",
}: {
  email: string | null;
  password: string | null;
  pending: boolean;
  compact?: boolean;
  field?: "login" | "senha" | "both";
}) {
  if (pending) {
    if (field === "senha") return <span className="text-slate-400">—</span>;
    return (
      <span
        className="text-[10px] font-semibold text-amber-700 dark:text-amber-400"
        title="Gere o login em Suporte → Logins clientes ou na produção (Login Player)"
      >
        sem login
      </span>
    );
  }
  if (field === "login") {
    return email ?
        <CopyableCell text={email} label="Copiar login do cliente" mono />
      : <span className="text-slate-400">—</span>;
  }
  if (field === "senha") {
    return password ?
        <CopyableCell text={password} label="Copiar senha do cliente" mono />
      : <span className="text-slate-400">—</span>;
  }
  if (!email && !password) {
    return <span className="text-slate-400">—</span>;
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <CopyableCell text={email ?? ""} label="Copiar login do cliente" mono />
        <CopyableCell text={password ?? ""} label="Copiar senha do cliente" mono />
      </div>
    );
  }

  return (
    <>
      <CopyableCell text={email ?? ""} label="Copiar login do cliente" mono />
      <CopyableCell text={password ?? ""} label="Copiar senha do cliente" mono />
    </>
  );
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
      if (digits && c.portalClienteId != null && String(c.portalClienteId).includes(digits)) {
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
          Busque pelo nome ou ID do Player. A lista mostra só PDVs da competência vigente.
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
                  {c.portalClienteId ?? "—"}
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
  const clienteTagBg = rioTagCobrancaRowBgClass(cliente.tagCobranca);
  return (
    <div
      className={
        "flex flex-wrap items-center gap-3 border-b px-4 py-3 " +
        (clienteTagBg ||
          "border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-white dark:border-sky-900/50 dark:from-sky-950/40 dark:to-slate-900")
      }
    >
      <IdCell
        id={cliente.portalClienteId}
        label="Copiar ID do cliente no Player"
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
        <div className="mt-1">
          <ClienteLoginInfo
            email={cliente.clienteLoginEmail}
            password={cliente.clienteLoginPassword}
            pending={cliente.clienteLoginPending}
            compact
          />
        </div>
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
    <div className="min-w-[4rem]">
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
  onClick,
  active = false,
}: {
  title: string;
  value: string;
  sub: string;
  subTone?: "muted" | "good" | "warn" | "bad";
  icon: string;
  tone: "green" | "blue" | "orange" | "violet" | "rose" | "slate";
  onClick?: () => void;
  active?: boolean;
}) {
  const tones = {
    green: "bg-emerald-500",
    blue: "bg-sky-500",
    orange: "bg-amber-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
    slate: "bg-slate-500",
  };
  const subColors = {
    muted: "text-slate-500",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={
        "rounded-xl border bg-white p-4 text-left shadow-sm transition dark:bg-slate-900 " +
        (onClick ? "cursor-pointer hover:shadow-md " : "") +
        (active
          ? "border-fuchsia-400 ring-2 ring-fuchsia-400/40 dark:border-fuchsia-600"
          : "border-slate-200 dark:border-slate-700")
      }
    >
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
    </Tag>
  );
}

function ClientesCanceladosDialog({
  open,
  clientes,
  onClose,
}: {
  open: boolean;
  clientes: SuporteClienteCancelado[];
  onClose: () => void;
}) {
  const dlgRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={dlgRef}
      className="w-[min(560px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Clientes cancelados</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Saídas na Planilha Rio (fora do baseline de organização).
        </p>
      </div>
      <ul className="max-h-[min(480px,60vh)] overflow-y-auto py-1">
        {clientes.length === 0 ?
          <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum cliente cancelado.</li>
        : clientes.map((c) => (
            <li key={c.rioLinhaId} className="border-b border-slate-100 px-4 py-2.5 last:border-0 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                <RioTagCobrancaNome nome={c.nome} tag={c.tagCobranca} />
              </p>
              {c.dataSaidaTexto ?
                <p className="text-[11px] text-slate-500">Saída: {c.dataSaidaTexto}</p>
              : null}
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
          Fechar
        </button>
      </div>
    </dialog>
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
  const trimmed =
    id != null ?
      variant === "pdv" ?
        formatPortalPdvIdDisplay(id)
      : String(id)
    : "";
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

function PlayerTelemetryHint({
  row,
  telemetriaDisponivel,
}: {
  row: SuportePdvRow;
  telemetriaDisponivel: boolean;
}) {
  if (row.portalPdvId == null) {
    return (
      <span className="text-[10px] text-amber-700 dark:text-amber-300" title="Atribua ID Player em Cadastros → IDs Player">
        sem ID Player
      </span>
    );
  }
  if (!telemetriaDisponivel) {
    return (
      <span className="text-[10px] text-slate-400" title="Portal não conseguiu ler o cloud2 (ping/cache)">
        cloud2 offline
      </span>
    );
  }
  if (!row.telemetry.lastPingAt) {
    return (
      <span className="text-[10px] text-slate-400" title="Player 5 ainda não fez ping neste PDV">
        aguardando ping
      </span>
    );
  }
  return null;
}

function PlayerTokenCell({
  row,
  canRegenerate,
  onRegenerated,
}: {
  row: SuportePdvRow;
  canRegenerate: boolean;
  onRegenerated: (newToken: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const token = row.playerInstalacaoToken;

  async function regerar() {
    if (!canRegenerate || busy) return;
    if (
      !window.confirm(
        "Gera uma nova chave de instalação. O player atual deixa de funcionar e ping/cache deste PDV serão zerados. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/suporte/pdv/${encodeURIComponent(row.rioPdvKey)}/regenerar-token`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        playerInstalacaoToken?: string;
        telemetryResetError?: string | null;
        gatewaySyncError?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.playerInstalacaoToken) {
        throw new Error(data.error ?? "falhou");
      }
      onRegenerated(data.playerInstalacaoToken);
      if (data.telemetryResetError || data.gatewaySyncError) {
        window.alert(
          [
            "Nova chave gerada.",
            data.gatewaySyncError ? `Sync gateway: ${data.gatewaySyncError}.` : null,
            data.telemetryResetError ? `Reset telemetria: ${data.telemetryResetError}.` : null,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao regerar token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-[7rem] flex-col gap-1">
      {token ?
        <div className="flex items-center gap-0.5">
          <span
            className="max-w-[5.5rem] truncate font-mono text-[10px] text-slate-600 dark:text-slate-300"
            title={token}
          >
            {token.slice(0, 8)}…
          </span>
          <CopyTextButton size="compact" variant="icon" text={token} label="Copiar token" />
        </div>
      : <span className="text-[10px] text-slate-400">sem token</span>}
      {canRegenerate ?
        <button
          type="button"
          disabled={busy}
          className="rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          onClick={() => void regerar()}
        >
          {busy ? "…" : "Regerar"}
        </button>
      : null}
    </div>
  );
}

function PdvRow({
  row,
  showIdentBlock,
  showPlayerBlock,
  showContatosBlock,
  clienteMode,
  telemetriaDisponivel,
  canRegenerarToken,
  onTokenRegenerated,
}: {
  row: SuportePdvRow;
  showIdentBlock: boolean;
  showPlayerBlock: boolean;
  showContatosBlock: boolean;
  clienteMode: boolean;
  telemetriaDisponivel: boolean;
  canRegenerarToken: boolean;
  onTokenRegenerated: (rioPdvKey: string, newToken: string) => void;
}) {
  const telHref =
    row.contatoLojaTelefone ?
      `tel:${row.contatoLojaTelefone.replace(/\s/g, "")}`
    : undefined;
  const mailHref =
    row.contatoLojaEmail ? `mailto:${row.contatoLojaEmail.split(/[,;]/)[0]?.trim()}` : undefined;
  const pdvTag = effectiveRioTagCobranca(row.tagCobranca, row.clienteTagCobranca);
  const tagBg = rioTagCobrancaRowBgClass(pdvTag);
  const stickyBg = stickyPdvRowBg(tagBg, row.semPing5Dias);

  return (
    <tr
      className={
        "border-b border-slate-100 dark:border-slate-800 " +
        (tagBg ?
          tagBg
        : row.semPing5Dias ?
          "bg-rose-50/70 dark:bg-rose-950/20"
        : "hover:bg-white/80 dark:hover:bg-slate-900/50")
      }
    >
      <td className={STICKY_PDV_TD + " " + stickyBg}>
        <div className="flex min-w-0 items-start gap-0.5">
          <span className="min-w-0 flex-1 font-semibold leading-snug">
            <RioTagCobrancaNome nome={row.nome} tag={pdvTag} />
          </span>
          {row.nome.trim() ?
            <CopyTextButton size="compact" variant="icon" text={row.nome.trim()} label="Copiar nome do PDV" />
          : null}
        </div>
        {row.semPing5Dias ?
          <span className="text-[9px] font-semibold text-rose-600 dark:text-rose-400">Sem ping 5d+</span>
        : null}
      </td>
      {showIdentBlock ?
        <>
          <td className="w-[3.75rem] whitespace-nowrap px-1.5 py-1.5 align-top">
            <IdCell id={row.portalPdvId} label="Copiar ID do PDV no Player" variant="pdv" />
          </td>
          <td className="w-[6.75rem] whitespace-nowrap px-1.5 py-1.5 align-top">
            <CopyableCell text={displayBrazilianTaxId(row.cnpj)} label="Copiar CNPJ do PDV" mono />
          </td>
          {clienteMode ?
            <td className="min-w-[5.5rem] max-w-[8rem] px-1.5 py-1.5 align-top">
              <ProgramacaoCriacaoCell nome={row.programacaoCriacaoNome} />
            </td>
          : <>
              <td className="min-w-[5.5rem] max-w-[8.5rem] px-1.5 py-1.5 align-top">
                <span className="block truncate text-[11px]">
                  <RioTagCobrancaNome nome={row.clienteNome} tag={row.clienteTagCobranca} />
                </span>
              </td>
              <td className="min-w-[6.5rem] max-w-[8.5rem] px-1.5 py-1.5 align-top">
                <ClienteLoginInfo
                  email={row.clienteLoginEmail}
                  password={row.clienteLoginPassword}
                  pending={row.clienteLoginPending}
                  field="login"
                />
              </td>
              <td className="w-[4.25rem] max-w-[5.5rem] px-1.5 py-1.5 align-top">
                <ClienteLoginInfo
                  email={row.clienteLoginEmail}
                  password={row.clienteLoginPassword}
                  pending={row.clienteLoginPending}
                  field="senha"
                />
              </td>
            </>
          }
        </>
      : null}
      {showPlayerBlock ?
        <>
          <td className={"w-[4.5rem] px-1.5 py-1.5 align-top " + BLOCK_DIVIDER}>
            <DownloadBar percent={row.telemetry.downloadPercent} />
            <PlayerTelemetryHint row={row} telemetriaDisponivel={telemetriaDisponivel} />
          </td>
          <td className="w-[5rem] px-1.5 py-1.5 align-top">
            <PlayerTokenCell
              row={row}
              canRegenerate={canRegenerarToken}
              onRegenerated={(newToken) => onTokenRegenerated(row.rioPdvKey, newToken)}
            />
          </td>
          {!clienteMode ?
            <td className="min-w-[5rem] max-w-[7rem] px-1.5 py-1.5 align-top">
              <ProgramacaoCriacaoCell nome={row.programacaoCriacaoNome} />
            </td>
          : null}
          <td className="w-[3.25rem] whitespace-nowrap px-1.5 py-1.5 align-top text-[10px] text-slate-500">
            {formatPlayerVersionLabel(row.telemetry.playerVersion ?? row.playerVersion) ?? "—"}
          </td>
          <td className="w-[5.25rem] whitespace-nowrap px-1.5 py-1.5 align-top text-[10px] text-slate-500">
            {fmtPing(row.telemetry.firstPingAt)}
          </td>
          <td className="w-[5.25rem] whitespace-nowrap px-1.5 py-1.5 align-top text-[10px] text-slate-500">
            {fmtPing(row.telemetry.lastPingAt)}
          </td>
        </>
      : null}
      {showContatosBlock ?
        <>
          <td className={"min-w-[5rem] max-w-[7rem] px-1.5 py-1.5 align-top " + BLOCK_DIVIDER}>
            <ContactCell value={row.contatoLojaNome} />
          </td>
          <td className="w-[5.5rem] px-1.5 py-1.5 align-top">
            <ContactCell value={row.contatoLojaTelefone} href={telHref} />
          </td>
          <td className="min-w-[5.5rem] max-w-[8rem] px-1.5 py-1.5 align-top">
            <ContactCell
              value={row.contatoLojaEmail}
              href={mailHref}
              copyLabel="Copiar e-mail da loja"
            />
          </td>
          <td className="w-[3.25rem] px-1.5 py-1.5 align-top">
            {row.googleMapsUrl ?
              <a
                href={row.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-sky-950/40"
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

function mapSuporteLoadErr(message: string): string {
  if (message === "unauthorized") return "Sessão expirada. Saia e entre novamente no portal.";
  if (message === "forbidden") return "Seu perfil não tem acesso ao dashboard de suporte.";
  return message;
}

export function ProducaoSuportePanel() {
  const [data, setData] = useState<ProducaoSuportePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todos");
  const [batchSize, setBatchSize] = useState<BatchSize>(DEFAULT_BATCH);
  const [visibleCount, setVisibleCount] = useState<number>(DEFAULT_BATCH);
  const [showIdentBlock, setShowIdentBlock] = useState(true);
  const [showPlayerBlock, setShowPlayerBlock] = useState(true);
  const [showContatosBlock, setShowContatosBlock] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("pdv");
  const [selectedClienteKey, setSelectedClienteKey] = useState<string | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [canceladosOpen, setCanceladosOpen] = useState(false);
  const [forceLiveMode, setForceLiveMode] = useState(false);

  const clienteMode = viewMode === "cliente" && Boolean(selectedClienteKey);
  const colCount = suporteColCount(showIdentBlock, showPlayerBlock, showContatosBlock, clienteMode);
  const identColSpan = clienteMode ? (showIdentBlock ? 4 : 1) : showIdentBlock ? 6 : 1;
  const playerColSpan = clienteMode ? 5 : 6;
  const hasExtraColumns =
    (showIdentBlock && identColSpan > 1) || showPlayerBlock || showContatosBlock;

  const clienteOptions = useMemo(() => {
    if ((data?.pdvs?.length ?? 0) > 0) return buildClienteOptionsFromRows(data!.pdvs);
    return (data?.clientes ?? []).map(summaryToClienteOption);
  }, [data?.clientes, data?.pdvs]);

  const selectedCliente = useMemo(
    () => clienteOptions.find((c) => c.key === selectedClienteKey) ?? null,
    [clienteOptions, selectedClienteKey],
  );

  const load = useCallback(async (opts?: { live?: boolean }) => {
    setBusy(true);
    setMsg("");
    const live = opts?.live ?? forceLiveMode;
    try {
      const url = live ? "/api/producao/suporte?live=1" : "/api/producao/suporte";
      const res = await fetch(url);
      const json = (await res.json()) as ProducaoSuportePayload & { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setData(json);
      if (live) setForceLiveMode(true);
      setVisibleCount(DEFAULT_BATCH);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Erro ao carregar suporte.";
      setMsg(mapSuporteLoadErr(raw));
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [forceLiveMode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisibleCount((prev) => Math.max(batchSize, prev));
  }, [batchSize]);

  const filtered = useMemo(() => {
    const list = data?.pdvs ?? [];
    return list.filter((row) => {
      if (listFilter === "sem_ping" && !row.semPing5Dias) return false;
      if (listFilter === "instalados") {
        if (
          !(
            row.playerInstalacaoToken &&
            row.telemetry.firstPingAt &&
            row.statusPlayer === "Ativo"
          )
        ) {
          return false;
        }
      }
      if (listFilter === "sem_primeiro_ping") {
        if (!(row.portalPdvId != null && !row.telemetry.firstPingAt && row.statusPlayer === "Ativo")) {
          return false;
        }
      }
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

  function handleTokenRegenerated(rioPdvKey: string, newToken: string) {
    setData((prev) => {
      if (!prev) return prev;
      const telemetriaOk = prev.overview.telemetriaDisponivel;
      return {
        ...prev,
        pdvs: prev.pdvs.map((r) => {
          if (r.rioPdvKey !== rioPdvKey) return r;
          const semPing5Dias = telemetriaOk && r.statusPlayer === "Ativo";
          return {
            ...r,
            playerInstalacaoToken: newToken,
            playerVersion: null,
            telemetry: { ...EMPTY_TELEMETRY },
            semPing5Dias,
          };
        }),
      };
    });
  }

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;
  const ov = data?.overview;
  const telemetriaDisponivel = ov?.telemetriaDisponivel ?? false;

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
        {data?.rioSourceYearMonth != null ?
          <span
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            title="Nomes Rio vêm de competência fixa; produção não segue virada automática"
          >
            Espelho Rio: {formatYearMonthLabel(data.rioSourceYearMonth)}
          </span>
        : null}
      </header>

      {msg ?
        <p className="mb-3 text-sm text-rose-700 dark:text-rose-400">{msg}</p>
      : null}

      {data?.suporteFonte && data.suporteFonte !== "espelho" ?
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <div>
            <p className="font-semibold">
              {data.suporteFonte === "live" ?
                "Modo ao vivo (espelho desligado ou forçado)"
              : "Fallback ao vivo — espelho falhou"}
            </p>
            {data.suporteFonteErro ?
              <p className="mt-0.5 text-[11px] opacity-90">{data.suporteFonteErro}</p>
            : null}
            <p className="mt-0.5 text-[11px] opacity-80">
              Mais lento, porém seguro se o snapshot estiver quebrado. Env de emergência:{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">SUPORTE_ESPELHO=0</code>
            </p>
          </div>
          {data.suporteFonte === "espelho_fallback" ?
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setForceLiveMode(false);
                void load({ live: false });
              }}
              className="shrink-0 rounded-lg border border-amber-600 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950 dark:text-amber-100"
            >
              Tentar espelho de novo
            </button>
          : null}
        </div>
      : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void load({ live: true })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          title="Recalcula na hora (cloud2 + cadastros) — use se o espelho estiver estranho"
        >
          Recarregar ao vivo
        </button>
        {forceLiveMode ?
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setForceLiveMode(false);
              void load({ live: false });
            }}
            className="rounded-lg border border-fuchsia-400 px-3 py-1.5 text-xs font-semibold text-fuchsia-800 hover:bg-fuchsia-50 disabled:opacity-50 dark:text-fuchsia-200"
          >
            Voltar ao espelho
          </button>
        : null}
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OverviewCard
          title="PDVs"
          value={String(ov?.totalPdvs ?? "—")}
          sub="Base cadastro produção"
          icon="📻"
          tone="green"
          onClick={() => {
            setListFilter("todos");
            setVisibleCount(batchSize);
          }}
          active={listFilter === "todos"}
        />
        <OverviewCard
          title="Players instalados"
          value={String(ov?.playersInstalados ?? "—")}
          sub="Token amarrado + 1º ping"
          icon="✅"
          tone="violet"
          onClick={() => {
            setListFilter("instalados");
            setVisibleCount(batchSize);
          }}
          active={listFilter === "instalados"}
        />
        <OverviewCard
          title="Sem 1º ping"
          value={String(ov?.semPrimeiroPing ?? "—")}
          sub="Com ID Player, aguardando instalação"
          icon="⏳"
          tone="slate"
          onClick={() => {
            setListFilter("sem_primeiro_ping");
            setVisibleCount(batchSize);
          }}
          active={listFilter === "sem_primeiro_ping"}
        />
        <OverviewCard
          title="Sem ping 5 dias"
          value={telemetriaDisponivel ? String(ov?.semPing5Dias ?? "—") : "—"}
          sub={
            !telemetriaDisponivel ?
              "Telemetria indisponível"
            : ov && ov.semPing5Dias > 0 ?
              "Player ativo sem ping recente"
            : "Nenhum alerta no momento"
          }
          subTone={
            !telemetriaDisponivel ? "muted"
            : ov && ov.semPing5Dias > 0 ? "bad"
            : "good"
          }
          icon="⚠️"
          tone="orange"
          onClick={() => {
            setListFilter("sem_ping");
            setVisibleCount(batchSize);
          }}
          active={listFilter === "sem_ping"}
        />
        <OverviewCard
          title="Cache médio"
          value={
            telemetriaDisponivel && ov?.cacheMedioPercent != null ?
              `${ov.cacheMedioPercent}%`
            : "—"
          }
          sub={
            telemetriaDisponivel ?
              `Pings hoje: ${ov?.pingsHoje ?? 0} · espelho suporte`
            : "Player 5 → cloud2 → portal"
          }
          icon="📡"
          tone="blue"
        />
        <OverviewCard
          title="Clientes cancelados"
          value={String(ov?.clientesCancelados ?? "—")}
          sub="Clique para ver a lista"
          icon="🚫"
          tone="rose"
          onClick={() => setCanceladosOpen(true)}
        />
      </section>

      {data?.espelhoBuiltAt ?
        <p className="mb-3 text-[10px] text-slate-500">
          Espelho suporte: {new Date(data.espelhoBuiltAt).toLocaleString("pt-BR")}
          {data.espelhoTelemetryAt ?
            ` · telemetria ${new Date(data.espelhoTelemetryAt).toLocaleString("pt-BR")}`
          : ""}
          {" · ordenado por 1º ping (instalações recentes no topo)"}
        </p>
      : null}

      {!telemetriaDisponivel && data ?
        <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-snug text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          Telemetria do Player 5 (versão, ping, cache) vem do gateway cloud2 — ping a cada ~60 min e
          `save_atualizadas` no download. Confira `CLOUD2_BASE_URL` + secret e se o PDV já tem ID Player
          sincronizado.
        </p>
      : null}

      <section className="mb-4 flex flex-col items-center px-2 py-2">
        <label className="w-full max-w-2xl text-center">
          <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Buscar PDV ou cliente
          </span>
          <input
            type="search"
            autoComplete="off"
            placeholder="CNPJ, nome da loja, cliente ou ID Player (ex. 316.001)…"
            className="w-full rounded-xl border-2 border-fuchsia-300 bg-white px-5 py-3.5 text-center text-base shadow-sm placeholder:text-slate-400 focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 dark:border-fuchsia-800 dark:bg-slate-950 dark:text-white"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisibleCount(batchSize);
            }}
          />
        </label>
      </section>

      <ClientesCanceladosDialog
        open={canceladosOpen}
        clientes={data?.clientesCancelados ?? []}
        onClose={() => setCanceladosOpen(false)}
      />

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
              Todos ({data?.overview.totalPdvs ?? 0})
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
            <BlockColumnToggle
              active={showIdentBlock}
              label="Identificação"
              onClick={() => setShowIdentBlock((v) => !v)}
            />
            <BlockColumnToggle
              active={showPlayerBlock}
              label="Player 5"
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
              setShowIdentBlock(true);
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
              setShowIdentBlock(true);
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
          <table className="w-max min-w-full border-collapse text-left text-[11px]">
            <thead className="bg-[#f5f0e8] text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95">
              <tr className="text-[9px] font-semibold normal-case tracking-normal text-slate-400">
                <th colSpan={identColSpan} className="px-2 pb-0 pt-2 text-left">
                  {clienteMode ? "PDVs do cliente" : "Identificação"}
                </th>
                {showPlayerBlock ?
                  <th colSpan={playerColSpan} className={"px-2 pb-0 pt-2 text-left " + BLOCK_DIVIDER}>
                    Player 5 · cloud2
                  </th>
                : null}
                {showContatosBlock ?
                  <th colSpan={4} className={"px-2 pb-0 pt-2 text-left " + BLOCK_DIVIDER}>
                    Contatos
                  </th>
                : null}
              </tr>
              <tr>
                <th className={STICKY_PDV_TH}>PDV</th>
                {showIdentBlock ?
                  <>
                    <th className="w-[3.75rem] px-1.5 py-1.5 text-center" title="ID PDV no Player">
                      ID PDV
                    </th>
                    <th className="w-[6.75rem] whitespace-nowrap px-1.5 py-1.5">CNPJ</th>
                    {clienteMode ?
                      <th
                        className="min-w-[5.5rem] px-1.5 py-1.5"
                        title="Amarração definida na Central de programações (criação)"
                      >
                        Programação
                      </th>
                    : <>
                        <th className="min-w-[5.5rem] px-1.5 py-1.5">Cliente</th>
                        <th className="min-w-[6.5rem] px-1.5 py-1.5" title="E-mail de login no Player 5">
                          Login
                        </th>
                        <th className="w-[4.25rem] px-1.5 py-1.5" title="Senha de login no Player 5">
                          Senha
                        </th>
                      </>
                    }
                  </>
                : null}
                {showPlayerBlock ?
                  <>
                    <th className={"w-[4.5rem] whitespace-nowrap px-1.5 py-1.5 " + BLOCK_DIVIDER}>Cache</th>
                    <th className="w-[5rem] whitespace-nowrap px-1.5 py-1.5" title="Chave serial de instalação do Player 5">
                      Token
                    </th>
                    {!clienteMode ?
                      <th
                        className="min-w-[5rem] px-1.5 py-1.5"
                        title="Amarração definida na Central de programações (criação)"
                      >
                        Prog.
                      </th>
                    : null}
                    <th className="w-[3.25rem] whitespace-nowrap px-1.5 py-1.5">Versão</th>
                    <th className="w-[5.25rem] whitespace-nowrap px-1.5 py-1.5">1º ping</th>
                    <th className="w-[5.25rem] whitespace-nowrap px-1.5 py-1.5">Últ. ping</th>
                  </>
                : null}
                {showContatosBlock ?
                  <>
                    <th className={"min-w-[5rem] px-1.5 py-1.5 " + BLOCK_DIVIDER}>Contato</th>
                    <th className="w-[5.5rem] px-1.5 py-1.5">Tel.</th>
                    <th className="min-w-[5.5rem] px-1.5 py-1.5">E-mail</th>
                    <th className="w-[3.25rem] px-1.5 py-1.5">Maps</th>
                  </>
                : null}
              </tr>
            </thead>
            <tbody>
              {busy && !data ?
                <tr>
                  <td colSpan={colCount} className="px-4 py-6 text-sm text-slate-500">
                    Carregando espelho do suporte…
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
                    showIdentBlock={showIdentBlock}
                    showPlayerBlock={showPlayerBlock}
                    showContatosBlock={showContatosBlock}
                    clienteMode={clienteMode}
                    telemetriaDisponivel={telemetriaDisponivel}
                    canRegenerarToken={data?.canRegenerarToken ?? false}
                    onTokenRegenerated={handleTokenRegenerated}
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
              : `Mostrando ${visible.length} de ${filtered.length} PDVs · 1º ping mais recente no topo`}
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
          Listagem pré-processada (espelho suporte). Ordem: 1º ping mais recente no topo. Telemetria
          atualiza em background a cada ~12 min. Patch imediato ao regerar token ou editar cadastro.
        </p>
      </section>
    </div>
  );
}
