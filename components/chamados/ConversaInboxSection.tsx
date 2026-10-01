"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  headerClass?: string;
  children: ReactNode;
};

export function ConversaInboxSection({ title, open, onToggle, count, headerClass, children }: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={
          "sticky top-0 z-10 flex w-full items-center justify-between px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider " +
          (headerClass ?? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400")
        }
      >
        <span>
          {open ? "▾" : "▸"} {title}
          {count != null && count > 0 ? ` (${count})` : ""}
        </span>
      </button>
      {open ? children : null}
    </>
  );
}
