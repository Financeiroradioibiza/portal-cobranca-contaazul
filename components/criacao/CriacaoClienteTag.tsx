"use client";

import {
  rioTagCobrancaRowBgClass,
  type RioTagCobranca,
} from "@/lib/rio/rioTagCobranca";
import { RioTagCobrancaNome } from "@/components/rio/RioTagCobrancaNome";

export type CriacaoClienteRow = {
  ref: string;
  nome: string;
  pdvCount?: number;
  tagCobranca?: RioTagCobranca;
};

export function CriacaoClienteNomeComTag({
  nome,
  tagCobranca,
  className,
}: {
  nome: string;
  tagCobranca?: RioTagCobranca;
  className?: string;
}) {
  return (
    <RioTagCobrancaNome tag={tagCobranca} nome={nome} className={className ?? "truncate"} />
  );
}

export function criacaoClienteRowClass(
  tagCobranca: RioTagCobranca | undefined,
  selected: boolean,
): string {
  const tagBg = rioTagCobrancaRowBgClass(tagCobranca);
  if (selected) {
    return (
      "bg-amber-100/80 font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100 " +
      (tagBg ? tagBg : "")
    );
  }
  return (
    "hover:bg-white/80 dark:hover:bg-slate-800/50 " + (tagBg ? tagBg : "")
  );
}
