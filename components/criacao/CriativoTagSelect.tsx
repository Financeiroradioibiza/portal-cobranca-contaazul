"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Criativo = {
  email: string;
  displayName: string;
  tagIniciais: string;
  tagCor: string;
};

type Props = {
  value: string;
  onChange: (email: string) => void;
  onSelected?: (criativo: Criativo | null) => void;
  label?: string;
  help?: string;
  className?: string;
};

export function CriativoTagSelect({
  value,
  onChange,
  onSelected,
  label = "Estilo / tag de",
  help = "Quem define iniciais e cor da tag (pode ser diferente de quem está subindo).",
  className = "",
}: Props) {
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultEmail, setDefaultEmail] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/criacao/criativos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.criativos) return;
        setCriativos(d.criativos as Criativo[]);
        setDefaultEmail(String(d.currentUserEmail ?? "").trim());
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (value.trim() || !defaultEmail) return;
    onChangeRef.current(defaultEmail);
  }, [value, defaultEmail]);

  const selected = useMemo(
    () => criativos.find((c) => c.email === value) ?? null,
    [criativos, value],
  );

  const onSelectedRef = useRef(onSelected);
  onSelectedRef.current = onSelected;
  useEffect(() => {
    onSelectedRef.current?.(selected);
  }, [selected]);

  return (
    <label className={`text-sm ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        {selected ?
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
            style={{ backgroundColor: selected.tagCor || "#6366f1" }}
            title={selected.displayName}
          >
            {selected.tagIniciais || "?"}
          </span>
        : null}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || criativos.length === 0}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {loading ?
            <option value="">Carregando…</option>
          : criativos.length === 0 ?
            <option value="">Nenhum usuário</option>
          : criativos.map((c) => (
              <option key={c.email} value={c.email}>
                {c.tagIniciais ? `[${c.tagIniciais}] ` : ""}
                {c.displayName}
              </option>
            ))}
        </select>
      </div>
      {help ?
        <p className="mt-1 text-[11px] text-slate-400">{help}</p>
      : null}
    </label>
  );
}

export function formatTagChipPreview(iniciais: string, tagNome: string): string {
  const n = tagNome.trim();
  if (!n) return iniciais ? `[${iniciais}] …` : "…";
  return iniciais ? `[${iniciais}] ${n}` : n;
}
