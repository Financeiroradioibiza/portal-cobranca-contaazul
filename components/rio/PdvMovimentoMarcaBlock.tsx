"use client";

import { useState } from "react";
import type { RioLinhaCb } from "@/components/rio/ClienteMarcaBlock";

type Props = {
  tag: "pdv_entrada" | "pdv_saida";
  titulo: string;
  linhas: RioLinhaCb[];
};

export function PdvMovimentoMarcaBlock({ tag, titulo, linhas }: Props) {
  const [open, setOpen] = useState(false);
  const mov = tag === "pdv_entrada" ? "entrada" : "saida";
  const items: { key: string; cliente: string; pdv: string }[] = [];

  for (const l of linhas) {
    for (const p of l.pdvs) {
      if ((p.movimento ?? "estavel") !== mov) continue;
      items.push({
        key: `${l.id}-${p.id}`,
        cliente: l.nomeFantasia,
        pdv: p.nome,
      });
    }
  }
  items.sort((a, b) =>
    a.cliente.localeCompare(b.cliente, "pt-BR", { sensitivity: "base" }) ||
    a.pdv.localeCompare(b.pdv, "pt-BR", { sensitivity: "base" }),
  );

  const bannerCls =
    tag === "pdv_entrada" ?
      "bg-sky-800 text-sky-50 dark:bg-sky-950"
    : "bg-orange-800 text-orange-50 dark:bg-orange-950";

  const countLabel =
    items.length === 0 ? "vazio"
    : items.length === 1 ? "1 PDV"
    : `${items.length} PDVs`;

  return (
    <tbody>
      <tr className={"border-x border-slate-800/85 " + bannerCls}>
        <td colSpan={12} className="px-3 py-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-[11px] font-semibold tracking-wide hover:opacity-95"
            onClick={() => setOpen((v) => !v)}
            title={open ? "Recolher lista" : "Expandir lista"}
          >
            <span className="w-4 shrink-0 text-center opacity-90" aria-hidden>
              {open ? "▼" : "▶"}
            </span>
            <span className="truncate">MARCA — {titulo}</span>
            <span className="ms-auto shrink-0 text-[10px] font-normal opacity-90">
              {countLabel}
              {!open && items.length > 0 ? " · recolhido" : ""}
            </span>
          </button>
        </td>
      </tr>
      {open ?
        items.length === 0 ?
          <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40">
            <td colSpan={12} className="px-3 py-2 text-[11px] italic text-slate-600 dark:text-slate-400">
              Nenhum PDV nesta lista neste mês.
            </td>
          </tr>
        : items.map((it) => (
            <tr
              key={it.key}
              className="border-b border-slate-100 bg-white dark:border-slate-900 dark:bg-slate-950"
            >
              <td colSpan={12} className="px-3 py-1 text-[11px]">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{it.cliente}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="text-slate-700 dark:text-slate-300">{it.pdv}</span>
              </td>
            </tr>
          ))
      : null}
    </tbody>
  );
}
