"use client";

import type { ProgramacaoDono } from "@/lib/criacao/programacaoDonoLocal";

type Criativo = {
  email: string;
  displayName: string;
  tagIniciais: string;
  tagCor: string;
};

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
  const emptyLabel = loading ? "carregando…" : criativos.length === 0 ? "sem usuários" : "escolher criativo";

  return (
    <label
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border-2 border-orange-400 bg-orange-50 px-2 py-1 shadow-sm dark:border-orange-500 dark:bg-orange-950/90"
      title="Dono criativo desta programação (salvo neste navegador)"
      htmlFor={`prog-dono-${programacaoId}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-200">
        Dono
      </span>
      {selected ?
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
          style={{ backgroundColor: selected.tagCor || "#6366f1" }}
          aria-hidden
        >
          {selected.tagIniciais || "?"}
        </span>
      : null}
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
        className="min-w-[7.5rem] max-w-[11rem] cursor-pointer rounded border border-orange-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-70 dark:border-orange-700 dark:bg-slate-900 dark:text-orange-50"
      >
        <option value="">{emptyLabel}</option>
        {criativos.map((c) => (
          <option key={c.email} value={c.email}>
            {c.tagIniciais ? `[${c.tagIniciais}] ` : ""}
            {c.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
