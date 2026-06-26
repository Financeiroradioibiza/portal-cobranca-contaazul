"use client";

import { useProgramacaoDonoMap } from "@/lib/criacao/useProgramacaoDonoMap";

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
}: {
  programacaoId: string;
  criativos: Criativo[];
  loading?: boolean;
}) {
  const { map, assignDono, removeDono } = useProgramacaoDonoMap();
  const dono = map[programacaoId] ?? null;
  const value = dono?.criativoEmail ?? "";
  const selected = criativos.find((c) => c.email === value) ?? null;
  const disabled = loading || criativos.length === 0;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-1.5 py-0.5 dark:border-violet-800 dark:bg-violet-950/50"
      title="Dono criativo desta programação (salvo neste navegador)"
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        Dono
      </span>
      {selected ?
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white"
          style={{ backgroundColor: selected.tagCor || "#6366f1" }}
          aria-hidden
        >
          {selected.tagIniciais || "?"}
        </span>
      : null}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const email = e.target.value;
          if (!email) {
            removeDono(programacaoId);
            return;
          }
          const criativo = criativos.find((c) => c.email === email);
          if (criativo) assignDono(programacaoId, criativo);
        }}
        className={
          "max-w-[8.5rem] cursor-pointer rounded border-0 bg-transparent py-0 pl-0 pr-4 text-[11px] font-semibold text-violet-900 outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-100"
        }
      >
        <option value="">{loading ? "…" : disabled ? "—" : "escolher…"}</option>
        {criativos.map((c) => (
          <option key={c.email} value={c.email}>
            {c.tagIniciais ? `[${c.tagIniciais}] ` : ""}
            {c.displayName}
          </option>
        ))}
      </select>
    </span>
  );
}
