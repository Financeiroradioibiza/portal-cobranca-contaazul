"use client";

import { useState } from "react";

export type MovimentoBannerItem = {
  key: string;
  label: string;
  sublabel?: string;
  linked?: boolean;
};

type Props = {
  variant: "novo" | "encerrado";
  title: string;
  hint: string;
  items: MovimentoBannerItem[];
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
  defaultOpen?: boolean;
};

export function CadastrosMovimentoBanner({
  variant,
  title,
  hint,
  items,
  onSelect,
  selectedKey,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const bannerCls =
    variant === "novo" ?
      "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
    : "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40";

  const headerCls =
    variant === "novo" ?
      "text-emerald-900 dark:text-emerald-100"
    : "text-rose-900 dark:text-rose-100";

  const itemCls =
    variant === "novo" ?
      "border-emerald-200 bg-white text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50"
    : "border-rose-200 bg-white text-rose-950 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-50";

  const countLabel =
    items.length === 0 ? "nenhum"
    : items.length === 1 ? "1 item"
    : `${items.length} itens`;

  return (
    <div className={"mb-3 overflow-hidden rounded-lg border " + bannerCls}>
      <button
        type="button"
        className={
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold " + headerCls
        }
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
        <span className="flex-1">{title}</span>
        <span className="text-[10px] font-normal opacity-80">{countLabel}</span>
      </button>
      {open ?
        <div className="space-y-1 border-t border-inherit px-2 py-2">
          <p className="px-1 text-[10px] opacity-75">{hint}</p>
          {items.length === 0 ?
            <p className="px-1 text-[10px] italic opacity-60">Nenhum neste mês.</p>
          : items.map((it) => {
              const active = selectedKey === it.key;
              const inner = (
                <>
                  <span className="font-semibold">{it.label}</span>
                  {it.sublabel ?
                    <span className="ml-1 text-[10px] opacity-75">· {it.sublabel}</span>
                  : null}
                  {it.linked != null ?
                    <span className="ml-1 text-[10px] opacity-60">
                      {it.linked ? "· painel" : "· sem painel"}
                    </span>
                  : null}
                </>
              );
              return onSelect ?
                  <button
                    key={it.key}
                    type="button"
                    className={
                      "block w-full rounded-md border px-2 py-1.5 text-left text-xs " +
                      itemCls +
                      (active ? " ring-2 ring-violet-400" : "")
                    }
                    onClick={() => onSelect(it.key)}
                  >
                    {inner}
                  </button>
                : <div key={it.key} className={"rounded-md border px-2 py-1.5 text-xs " + itemCls}>
                    {inner}
                  </div>;
            })
          }
        </div>
      : null}
    </div>
  );
}
