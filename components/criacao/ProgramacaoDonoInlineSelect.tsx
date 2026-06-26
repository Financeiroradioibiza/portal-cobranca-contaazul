"use client";

import type { ProgramacaoDono } from "@/lib/criacao/programacaoDonoLocal";

type Criativo = {
  email: string;
  displayName: string;
  tagIniciais: string;
  tagCor: string;
};

function siglaLabel(criativo: Criativo): string {
  const s = criativo.tagIniciais.trim().toUpperCase();
  return s ? `[${s}]` : "[?]";
}

export function ProgramacaoDonoInlineSelect({
  programacaoId,
  criativos,
  loading = false,
  dono,
  onAssign,
  onClear,
}: {
  programacaoId: string;
  criativos: Criativo[];
  loading?: boolean;
  dono: ProgramacaoDono | null;
  onAssign: (criativo: Criativo) => void;
  onClear: () => void;
}) {
  const value = dono?.criativoEmail ?? "";
  const selected = criativos.find((c) => c.email === value) ?? null;
  const disabled = loading || criativos.length === 0;
  const hoverTitle =
    selected ?
      `Dono: ${selected.displayName} (${selected.tagIniciais || "?"})`
    : "Escolher dono criativo (salvo neste navegador)";

  return (
    <label
      className="inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-orange-400 bg-orange-50 px-1.5 py-0.5 shadow-sm dark:border-orange-500 dark:bg-orange-950/90"
      title={hoverTitle}
      htmlFor={`prog-dono-${programacaoId}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-200">
        Dono
      </span>
      <span className="relative inline-flex h-6 min-w-[2.25rem] items-center justify-center">
        {selected ?
          <span
            className="pointer-events-none flex h-6 min-w-[2.25rem] items-center justify-center rounded px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: selected.tagCor || "#6366f1" }}
            aria-hidden
          >
            {selected.tagIniciais.trim().toUpperCase() || "?"}
          </span>
        : <span className="pointer-events-none text-[10px] font-semibold text-orange-700/70 dark:text-orange-300/70">
            {loading ? "…" : disabled ? "—" : "?"}
          </span>
        }
        <select
          id={`prog-dono-${programacaoId}`}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const email = e.target.value;
            if (!email) {
              onClear();
              return;
            }
            const criativo = criativos.find((c) => c.email === email);
            if (criativo) onAssign(criativo);
          }}
          className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label={hoverTitle}
        >
          <option value="">{loading ? "…" : "sem dono"}</option>
          {criativos.map((c) => (
            <option key={c.email} value={c.email} title={c.displayName}>
              {siglaLabel(c)}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
