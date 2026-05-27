"use client";

import { Fragment, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { parsePdvNamesFromMultilineText, sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { valorClienteTextoFromPdvUnit } from "@/lib/rio/valorClienteCalc";
import { readPdvDropFromDataTransfer } from "@/components/rio/PdvNomePoolColumn";
import { CopyTextButton } from "@/components/CopyTextButton";
import { parseEmailAddresses } from "@/lib/format";
import { isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type MovRioCb = "estavel" | "entrada" | "saida";

export type RioPdvCb = {
  id: string;
  nome: string;
  notes: string;
  sortOrder: number;
};

export type RioGrupoCb = {
  id: string;
  nome: string;
  sortOrder: number;
};

export type RioLinhaCb = {
  id: string;
  rioGrupoId: string | null;
  grupo?: RioGrupoCb | null;
  caPersonId: string;
  grupoSite: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  emailCobranca: string | null;
  valorClienteTexto: string;
  valorPdvUnitarioTexto: string;
  numeroPdvSite: number;
  categoriaSite: string;
  contratosAtivosTexto: string;
  movimento: MovRioCb;
  observacoesLinha: string;
  sortOrder: number;
  pdvs: RioPdvCb[];
};

const CAT_OPTS = ["", "moda", "shopping", "hotelaria", "gastronomia", "outro"];

export function badgeMov(m: MovRioCb) {
  if (m === "entrada") {
    return (
      <span className="rounded-full bg-emerald-100 px-1 py-0 text-[9px] font-bold text-emerald-900 dark:bg-emerald-900/55 dark:text-emerald-100">
        Entrada
      </span>
    );
  }
  if (m === "saida") {
    return (
      <span className="rounded-full bg-rose-100 px-1 py-0 text-[9px] font-bold text-rose-900 dark:bg-rose-900/55 dark:text-rose-100">
        Saída
      </span>
    );
  }
  return (
    <span className="inline-block min-w-[1rem] text-center text-[10px] text-slate-400 dark:text-slate-500">—</span>
  );
}

export function ctrCell(txt: string) {
  const t = txt.trim();
  if (!t || t === "—") {
    return (
      <span className="inline-flex min-w-[4rem] justify-center rounded bg-orange-500 px-1 py-0 text-[10px] font-semibold text-white">
        Sem ctr.
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[4rem] max-w-[11rem] justify-center truncate rounded bg-emerald-700 px-1 py-0 text-[10px] font-semibold text-white" title={t}>
      {t}
    </span>
  );
}

function SortClientRow(props: {
  r: RioLinhaCb;
  gruposTodos: RioGrupoCb[];
  onMarcaSel: (linhaId: string, marcaIdOuVazio: string) => void;
  onExpand: () => void;
  isOpen: boolean;
  patchLinha: (linhaId: string, patch: Record<string, unknown>) => void;
  onOpenCaLink: (r: RioLinhaCb) => void;
  onToggleCaLink: (r: RioLinhaCb) => void;
  onAddPdvsBulk: (linhaId: string, names: string[]) => void | Promise<void>;
  ym: number;
  setLinhas: Dispatch<SetStateAction<RioLinhaCb[]>>;
  addPdv: (linhaId: string) => void;
  patchPdv: (pdvId: string, nome: string) => void;
  delPdv: (pdvId: string) => void;
  newPdv: string;
  setNewPdv: (nome: string) => void;
}) {
  const { r, gruposTodos, onMarcaSel, onExpand, isOpen, onOpenCaLink, onToggleCaLink, onAddPdvsBulk } =
    props;
  const [pdvDropOver, setPdvDropOver] = useState(false);
  const [pastePdvs, setPastePdvs] = useState("");
  const vinculado = isRioCaPersonLinked(r.caPersonId);
  const emails = parseEmailAddresses((r.emailCobranca ?? "").trim());
  const emailsJoined = emails.join("\n");
  const emailPreview =
    emails.length === 0 ? "—" : emails.length > 1 ? `${emails[0]} (+${emails.length - 1})` : emails[0];
  const sid = String(r.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sid });
  const sty: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    boxShadow: isDragging ? "0 1px 6px rgba(0,0,0,.06)" : undefined,
  };

  const copyCliente = async () => {
    const t = [r.nomeFantasia.trim(), r.documento?.trim() ?? "", (r.emailCobranca ?? "").trim()]
      .filter(Boolean)
      .join("\t");
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* empty */
    }
  };

  const pdvsSorted = sortRioPdvsByNome(r.pdvs);

  return (
    <>
      <tr
        ref={setNodeRef}
        style={sty}
        className="h-[2rem] border-b border-slate-100 bg-white align-middle dark:border-slate-900 dark:bg-slate-950"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const names = readPdvDropFromDataTransfer(e.dataTransfer);
          if (names.length) void onAddPdvsBulk(r.id, names);
        }}
      >
        <td className="sticky left-0 z-[1] w-16 border-r border-slate-100 bg-inherit px-0 dark:border-slate-800">
          <span className="flex items-center">
            <button
              type="button"
              className="h-8 w-6 cursor-grab select-none rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
              title="Arrastar (ordenar nesta MARCA)"
              {...attributes}
              {...listeners}
            >
              ≡
            </button>
            <button
              type="button"
              title="Cliente, CNPJ, e-mail (separados por tab)"
              className="h-8 w-7 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white"
              onClick={() => void copyCliente()}
            >
              ⧉
            </button>
          </span>
        </td>
        <td className="border-l border-emerald-900/38 bg-emerald-800/12 px-0.5 py-0 dark:bg-emerald-900/42">
          <select
            className="box-border h-7 max-w-[8.75rem] truncate rounded border border-emerald-800/40 bg-transparent py-0 pl-1 text-[10px] leading-snug dark:border-emerald-700/65"
            value={r.rioGrupoId ?? ""}
            onChange={(ev) => onMarcaSel(r.id, ev.target.value)}
            title="Coluna MARCA (PDF)"
          >
            <option value="">Sem MARCA</option>
            {gruposTodos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </td>
        <td className="max-w-[15rem] min-w-[11rem] border-l border-emerald-900/35 bg-emerald-900/13 px-0.5 py-0 dark:bg-emerald-950/52">
          <button
            type="button"
            className="block max-w-full truncate text-left text-[11px] font-semibold text-emerald-950 underline-offset-2 hover:underline dark:text-emerald-100"
            title={r.nomeFantasia}
            onClick={onExpand}
          >
            {r.nomeFantasia}
          </button>
        </td>
        <td className="whitespace-nowrap px-1 font-mono text-[10px]" title={(r.documento ?? "").slice(0, 120)}>
          {r.documento ?? "—"}
        </td>
        <td className="border-l px-0 text-center">{badgeMov(r.movimento)}</td>
        <td className="px-0 text-center">{ctrCell(r.contratosAtivosTexto)}</td>
        <td className="max-w-[6.75rem] truncate px-1 text-[10px]" title={r.valorClienteTexto}>
          {r.valorClienteTexto?.trim() ? r.valorClienteTexto : "—"}
        </td>
        <td className="px-0.5">
          <input
            key={`n-pdv-${r.id}-${r.numeroPdvSite}`}
            type="number"
            min={0}
            className="box-border h-7 w-[3rem] rounded border border-slate-200 bg-transparent px-0.5 text-[11px] dark:border-slate-700"
            defaultValue={r.numeroPdvSite}
            onBlur={(e) => void props.patchLinha(r.id, { numeroPdvSite: Number(e.target.value) || 0 })}
          />
        </td>
        <td className="max-w-[7rem] px-0">
          <select
            className="box-border h-7 max-w-[7rem] truncate rounded border border-slate-200 bg-transparent px-1 text-[10px] dark:border-slate-700"
            defaultValue={r.categoriaSite || ""}
            onChange={(e) => void props.patchLinha(r.id, { categoriaSite: e.target.value })}
          >
            {CAT_OPTS.map((c) => (
              <option key={c || "__"} value={c}>
                {c || "—"}
              </option>
            ))}
          </select>
        </td>
        <td className="whitespace-nowrap px-0.5">
          {vinculado ?
            <button
              type="button"
              className="rounded border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200"
              title="Clique para desvincular da Conta Azul"
              onClick={() => onToggleCaLink(r)}
            >
              Vinculado CA
            </button>
          : <button
              type="button"
              className="rounded border border-red-600 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 hover:bg-red-100 dark:border-red-500 dark:bg-red-950/50 dark:text-red-200"
              title="Vincular a uma pessoa no Conta Azul"
              onClick={() => onOpenCaLink(r)}
            >
              Vincular CA
            </button>
          }
        </td>
        <td className="max-w-[9rem] px-0.5">
          <div className="flex min-w-0 items-center gap-0.5">
            {emails.length === 0 ?
              <span className="truncate text-[10px] text-slate-400">—</span>
            : <details className="min-w-0 flex-1">
                <summary
                  className="cursor-pointer list-none truncate text-[10px] text-sky-800 hover:underline dark:text-sky-400 [&::-webkit-details-marker]:hidden"
                  title={emailsJoined}
                >
                  {emailPreview}
                </summary>
                <ul className="mt-0.5 max-w-[12rem] list-none space-y-0.5 border-t border-slate-200 pt-0.5 text-[10px] dark:border-slate-700">
                  {emails.map((em) => (
                    <li key={em} className="truncate">
                      <a href={`mailto:${em}`} className="text-sky-700 dark:text-sky-400">
                        {em}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            }
            <CopyTextButton
              variant="icon"
              text={emailsJoined}
              label="Copiar e-mails"
              className="!h-6 !w-6 shrink-0"
            />
          </div>
        </td>
        <td className="max-w-[14rem] truncate px-1 text-[10px] text-slate-600 dark:text-slate-400" title={r.razaoSocial}>
          {r.razaoSocial || "—"}
        </td>
      </tr>
      {isOpen ?
        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-900 dark:bg-amber-950/15">
          <td colSpan={12} className="px-3 py-2">
            <div
              className={
                "rounded-lg border-2 border-dashed p-2 transition-colors " +
                (pdvDropOver ?
                  "border-amber-500 bg-amber-100/80 dark:border-amber-400 dark:bg-amber-950/50"
                : "border-amber-700/35 bg-transparent dark:border-amber-800/50")
              }
              onDragEnter={(e) => {
                e.preventDefault();
                setPdvDropOver(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setPdvDropOver(false);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setPdvDropOver(false);
                const names = readPdvDropFromDataTransfer(e.dataTransfer);
                if (names.length) void onAddPdvsBulk(r.id, names);
              }}
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-950/95 dark:text-amber-400">
                Solte aqui PDVs da coluna à direita (ou cole a lista abaixo)
              </p>
            <ul className="mb-2 max-w-[52rem] space-y-1">
              {pdvsSorted.map((p, pi) => (
                <PdvMini key={p.id} indexVis={pi + 1} p={p} patchPdv={props.patchPdv} del={props.delPdv} />
              ))}
            </ul>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[12rem] flex-1">
                <label className="mb-0.5 block text-[10px] font-medium text-amber-950/90 dark:text-amber-200/90">
                  Colar vários PDVs (um por linha)
                </label>
                <textarea
                  rows={4}
                  value={pastePdvs}
                  onChange={(e) => setPastePdvs(e.target.value)}
                  placeholder={"Loja A\nLoja B"}
                  className="w-full resize-y rounded border border-amber-800/30 bg-white px-2 py-1 font-mono text-[10px] dark:border-amber-900/50 dark:bg-slate-950"
                />
              </div>
              <button
                type="button"
                className="rounded border border-amber-800 bg-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-300 dark:border-amber-600 dark:bg-amber-900 dark:text-amber-50"
                onClick={() => {
                  const names = parsePdvNamesFromMultilineText(pastePdvs);
                  if (names.length) {
                    void onAddPdvsBulk(r.id, names);
                    setPastePdvs("");
                  }
                }}
              >
                Adicionar lista colada
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2 border-t border-amber-800/20 pt-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-amber-950/90 dark:text-amber-200/90">
                  Valor por PDV (manual)
                </label>
                <input
                  key={`v-pdv-u-${r.id}-${r.valorPdvUnitarioTexto}`}
                  className="w-[8.5rem] rounded border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                  placeholder="ex. 150,00"
                  defaultValue={r.valorPdvUnitarioTexto}
                  onBlur={(e) =>
                    void props.patchLinha(r.id, { valorPdvUnitarioTexto: e.target.value.trim() })
                  }
                />
                <p className="mt-0.5 text-[10px] text-amber-950/80 dark:text-amber-200/75">
                  Total na coluna «Valor»:{" "}
                  <strong>
                    {r.valorClienteTexto?.trim() ?
                      r.valorClienteTexto
                    : valorClienteTextoFromPdvUnit(r.valorPdvUnitarioTexto, r.numeroPdvSite) ||
                      "—"}
                  </strong>
                  {r.numeroPdvSite > 0 && r.valorPdvUnitarioTexto.trim() ?
                    <> ({r.numeroPdvSite} PDV × unit.)</>
                  : null}
                </p>
                <p className="text-[10px] italic text-amber-950/70 dark:text-amber-200/65">
                  Com CA vinculado, o valor pode vir do contrato ATIVO; se não houver, use valor por PDV.
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-800/20 pt-2">
              <input
                className="min-w-[13rem] rounded border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                placeholder="Um PDV só (nome)"
                value={props.newPdv}
                onChange={(e) => props.setNewPdv(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                onClick={() => void props.addPdv(r.id)}
              >
                + 1 PDV
              </button>
            </div>
            </div>
          </td>
        </tr>
      : null}
    </>
  );
}

function PdvMini(props: {
  indexVis: number;
  p: RioPdvCb;
  patchPdv: (pdvId: string, nome: string) => void;
  del: (pdvId: string) => void;
}) {
  const { indexVis } = props;
  return (
    <li className="flex flex-nowrap items-center gap-2 rounded-md border border-amber-900/45 bg-amber-100/80 px-2 py-0.5 text-[11px] dark:bg-amber-950/72 dark:border-amber-800/61">
      <span className="w-6 shrink-0 text-right font-bold tabular-nums text-amber-950 dark:text-amber-100">{indexVis}</span>
      <input
        className="min-w-[12rem] flex-1 rounded border border-transparent bg-transparent px-1 py-0 text-[11px] hover:border-amber-800/52 dark:hover:border-amber-600"
        defaultValue={props.p.nome}
        onBlur={(ev) => void props.patchPdv(props.p.id, ev.target.value)}
      />
      <button type="button" className="shrink-0 text-rose-600 underline" onClick={() => void props.del(props.p.id)}>
        remover
      </button>
    </li>
  );
}

export function ClienteMarcaBlock(props: {
  ym: number;
  /** null => bloco «sem MARCA». */
  marca: RioGrupoCb | null;
  gruposTodos: RioGrupoCb[];
  linhasOrdered: RioLinhaCb[];
  grupoIndex?: number | null;
  grupoCount?: number;
  onReorderLinhasSameMarca: (activeId: string, overId: string) => void;
  /** null => sem-marca bucket */
  onMoveMarca: (linhaId: string, novaMarcaOption: string) => void;
  onRenameMarca: (grupoId: string, nome: string) => void;
  onDeleteMarca: (grupoId: string) => void;
  onShiftMarca: (ix: number, delta: number) => void;
  onOpenCaLink: (r: RioLinhaCb) => void;
  onToggleCaLink: (r: RioLinhaCb) => void;
  onAddPdvsBulk: (linhaId: string, names: string[]) => void | Promise<void>;
  expanded: Set<string>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  patchLinha: (id: string, body: Record<string, unknown>) => void;
  setLinhas: Dispatch<SetStateAction<RioLinhaCb[]>>;
  addPdv: (linhaId: string) => void;
  patchPdv: (id: string, nome: string) => void;
  delPdv: (id: string) => void;
  newPdvName: Record<string, string>;
  setNewPdvName: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const {
    ym,
    marca,
    gruposTodos,
    linhasOrdered,
    grupoIndex,
    grupoCount,
    onReorderLinhasSameMarca,
    onMoveMarca,
    onRenameMarca,
    onDeleteMarca,
    onShiftMarca,
    onOpenCaLink,
    onToggleCaLink,
    onAddPdvsBulk,
    expanded,
    setExpanded,
    patchLinha,
    setLinhas,
    addPdv,
    patchPdv,
    delPdv,
    newPdvName,
    setNewPdvName,
  } = props;

  const linhaIds = linhasOrdered.map((l) => l.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onReorderLinhasSameMarca(String(active.id), String(over.id));
  };

  const headerTitle = marca ? marca.nome : "Sem MARCA";

  const bannerCls = marca
    ? "bg-emerald-800 text-emerald-50 dark:bg-emerald-950 dark:text-emerald-100 border-emerald-950/65"
    : "bg-slate-500 text-white dark:bg-slate-800 border-slate-700";

  return (
    <tbody className={"group-marca-" + (marca?.id ?? "none")}>
      <tr className={"border-x border-slate-800/85 " + bannerCls}>
        <td colSpan={12} className="px-3 py-1">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
            <span className="truncate tracking-wide">MARCA — {headerTitle}</span>
            {marca && typeof grupoIndex === "number" && typeof grupoCount === "number" && grupoCount > 1 ?
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded border border-white/35 px-2 py-0.5 hover:bg-white/14"
                  onClick={() => onShiftMarca(grupoIndex, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded border border-white/35 px-2 py-0.5 hover:bg-white/14"
                  onClick={() => onShiftMarca(grupoIndex, 1)}
                >
                  ↓
                </button>
              </span>
            : null}
            {marca ?
              <>
                <input
                  className="flex-1 min-w-[14rem] max-w-[42rem] rounded border border-emerald-200/43 bg-black/12 px-2 py-0.5 text-[11px] font-normal text-emerald-50 outline-none placeholder-emerald-200/73 dark:border-emerald-800/71 dark:bg-black/41"
                  defaultValue={marca.nome}
                  onBlur={(e) =>
                    marca && e.target.value.trim() !== marca.nome.trim() ?
                      void onRenameMarca(marca.id, e.target.value)
                    : undefined
                  }
                />
                <button
                  type="button"
                  className="shrink-0 rounded border border-rose-200/71 px-2 py-0 text-[10px] font-semibold uppercase text-white hover:bg-rose-950/66"
                  onClick={() => void onDeleteMarca(marca.id)}
                >
                  Apagar marca vazia
                </button>
              </>
            : null}
            <span className="ms-auto shrink-0 text-[10px] font-normal uppercase opacity-80">
              {(marca ?? null) ?
                <>Arraste ≡ para ordenar nesta MARCA. Coluna MARCA mudar bloco reorganiza hierarquia.</>
              : <>Linhas aqui ficam antes / depois dos blocos com MARCA segundo a ordem no painel.</>}
            </span>
          </div>
        </td>
      </tr>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={linhaIds} strategy={verticalListSortingStrategy}>
          {linhasOrdered.map((r) => (
            <SortClientRow
              key={r.id}
              ym={ym}
              r={r}
              gruposTodos={gruposTodos}
              onMarcaSel={(lid, nid) => onMoveMarca(lid, nid)}
              onExpand={() =>
                void setExpanded((prev) => {
                  const nx = new Set(prev);
                  if (nx.has(r.id)) nx.delete(r.id);
                  else nx.add(r.id);
                  return nx;
                })
              }
              isOpen={expanded.has(r.id)}
              onOpenCaLink={onOpenCaLink}
              onToggleCaLink={onToggleCaLink}
              onAddPdvsBulk={onAddPdvsBulk}
              patchLinha={patchLinha}
              setLinhas={setLinhas}
              addPdv={addPdv}
              patchPdv={patchPdv}
              delPdv={delPdv}
              newPdv={newPdvName[r.id] ?? ""}
              setNewPdv={(s) => setNewPdvName((p) => ({ ...p, [r.id]: s }))}
            />
          ))}
        </SortableContext>
      </DndContext>
      {marca && linhasOrdered.length === 0 ?
        <tr className="border-b border-emerald-900/25 bg-emerald-950/10 dark:bg-emerald-950/25">
          <td colSpan={12} className="px-3 py-2 text-[11px] italic text-emerald-900/90 dark:text-emerald-200/85">
            Nenhum cliente neste bloco — na coluna «Marca bloco» escolha esta MARCA ou arraste clientes de «Sem
            MARCA» para aqui (≡).
          </td>
        </tr>
      : null}
    </tbody>
  );
}
