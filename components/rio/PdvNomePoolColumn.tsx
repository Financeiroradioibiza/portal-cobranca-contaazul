"use client";

import { useMemo } from "react";
import { parsePdvNamesFromMultilineText, sortPdvNamesAlphabetically } from "@/lib/rio/pdvNames";

const MIME_ONE = "application/x-rio-pdv-nome";
const MIME_BULK = "application/x-rio-pdv-bulk";

function dragOne(e: React.DragEvent, nome: string) {
  e.dataTransfer.setData(MIME_ONE, nome);
  e.dataTransfer.effectAllowed = "copy";
}

function dragBulk(e: React.DragEvent, names: string[]) {
  e.dataTransfer.setData(MIME_BULK, JSON.stringify(names));
  e.dataTransfer.effectAllowed = "copy";
}

export { MIME_ONE, MIME_BULK };

export function readPdvDropFromDataTransfer(dt: DataTransfer): string[] {
  const bulk = dt.getData(MIME_BULK);
  if (bulk) {
    try {
      const parsed = JSON.parse(bulk) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* ignore */
    }
  }
  const one = dt.getData(MIME_ONE).trim();
  if (one) return [one];
  const plain = dt.getData("text/plain").trim();
  if (plain.includes("\n")) return parsePdvNamesFromMultilineText(plain);
  if (plain) return [plain];
  return [];
}

type Props = {
  text: string;
  onTextChange: (t: string) => void;
};

export function PdvNomePoolColumn({ text, onTextChange }: Props) {
  const names = useMemo(
    () => sortPdvNamesAlphabetically(parsePdvNamesFromMultilineText(text)),
    [text],
  );

  return (
    <aside className="sticky top-2 flex w-[11.5rem] shrink-0 flex-col gap-2 self-start rounded-xl border border-amber-400/70 bg-amber-50/90 p-2 shadow-sm dark:border-amber-800/80 dark:bg-amber-950/40">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:text-amber-200">
        Coluna de PDVs
      </p>
      <p className="text-[10px] leading-snug text-amber-950/85 dark:text-amber-100/85">
        Cole um nome por linha. Arraste cada linha (ou a lista inteira) para a zona amarela do cliente
        expandido.
      </p>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={14}
        placeholder={"Loja Centro\nLoja Norte\n…"}
        className="w-full resize-y rounded border border-amber-700/35 bg-white px-2 py-1 font-mono text-[10px] leading-snug text-slate-900 dark:border-amber-900/50 dark:bg-slate-950 dark:text-slate-100"
      />
      <p className="text-center text-[10px] tabular-nums text-amber-900/80 dark:text-amber-200/80">
        {names.length} nome{names.length !== 1 ? "s" : ""}
      </p>
      {names.length > 0 ?
        <button
          type="button"
          draggable
          onDragStart={(e) => dragBulk(e, names)}
          className="cursor-grab rounded border border-amber-800/50 bg-amber-200/80 px-2 py-1 text-[10px] font-semibold text-amber-950 active:cursor-grabbing dark:border-amber-600 dark:bg-amber-900/60 dark:text-amber-50"
        >
          ⋮⋮ Arrastar lista inteira
        </button>
      : null}
      <ul className="max-h-[min(40vh,320px)] space-y-0.5 overflow-y-auto rounded border border-amber-800/25 bg-white/60 p-1 dark:border-amber-900/40 dark:bg-black/20">
        {names.length === 0 ?
          <li className="px-1 py-2 text-center text-[10px] italic text-slate-500">Sem linhas</li>
        : names.map((nome, i) => (
            <li
              key={`${i}-${nome}`}
              draggable
              onDragStart={(e) => dragOne(e, nome)}
              title="Arrastar para um cliente"
              className="cursor-grab truncate rounded border border-transparent bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 hover:border-amber-700 active:cursor-grabbing dark:bg-amber-900/50 dark:text-amber-50"
            >
              {nome}
            </li>
          ))}
      </ul>
    </aside>
  );
}
