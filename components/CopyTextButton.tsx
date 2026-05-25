"use client";

import { useCallback, useState } from "react";

function IconClipboard({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="8"
        y="2"
        width="8"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function IconCheck({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m5 12 5 5L20 7"
      />
    </svg>
  );
}

type Props = {
  /** Text to put on clipboard */
  text: string;
  /** Screen reader label */
  label: string;
  className?: string;
  /** `icon`: botão só com símbolo (compacto). `text`: legado «Copiar» */
  variant?: "icon" | "text";
};

export function CopyTextButton({
  text,
  label,
  className = "",
  variant = "icon",
}: Props) {
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

  if (variant === "text") {
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

  return (
    <button
      type="button"
      onClick={(e) => void onClick(e)}
      disabled={disabled}
      aria-label={`${label}${ok ? " — copiado" : ""}`}
      title={disabled ? undefined : ok ? `${label} — copiado` : label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${ok ? "border-emerald-500/70 text-emerald-600 dark:border-emerald-500/60 dark:text-emerald-400" : ""} ${className}`}
    >
      {ok ? <IconCheck className="h-3.5 w-3.5" /> : <IconClipboard />}
    </button>
  );
}
