"use client";

import { useCallback, useState } from "react";

type Props = {
  /** Text to put on clipboard */
  text: string;
  /** Screen reader label */
  label: string;
  className?: string;
};

export function CopyTextButton({ text, label, className = "" }: Props) {
  const [ok, setOk] = useState(false);

  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const v = text.trim();
      if (!v) return;
      try {
        await navigator.clipboard.writeText(v);
        setOk(true);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = v;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          setOk(true);
        } catch {
          /* ignore */
        }
      }
      window.setTimeout(() => setOk(false), 1600);
    },
    [text],
  );

  const disabled = !text.trim();

  return (
    <button
      type="button"
      onClick={(e) => void onClick(e)}
      disabled={disabled}
      aria-label={`${label}${ok ? " — copiado" : ""}`}
      title={disabled ? undefined : ok ? `${label} — copiado` : label}
      className={`shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
    >
      {ok ? "OK" : "Copiar"}
    </button>
  );
}
