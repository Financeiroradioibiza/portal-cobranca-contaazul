"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  iconeBibliotecaPastaEmoji,
  type BibliotecaPastaView,
} from "@/lib/criacao/bibliotecaPastaService";
import type { BibliotecaFolderKey } from "@/lib/criacao/bibliotecaFolderTypes";
import { folderDropTargetId } from "@/lib/criacao/bibliotecaFolderTypes";
import type { BibliotecaSidebarTree } from "@/lib/criacao/bibliotecaSidebarService";

function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1e293b" : "#ffffff";
}

function SidebarItem({
  active,
  label,
  subtitle,
  emoji,
  cor,
  badge,
  droppableId,
  readOnly,
  onClick,
}: {
  active: boolean;
  label: string;
  subtitle?: string;
  emoji?: string;
  cor?: string;
  badge?: number;
  droppableId?: string | null;
  readOnly?: boolean;
  onClick: () => void;
}) {
  const drop = useDroppable({ id: droppableId ?? `no-drop-${label}`, disabled: !droppableId });
  const isOver = droppableId ? drop.isOver : false;

  return (
    <button
      type="button"
      ref={droppableId ? drop.setNodeRef : undefined}
      onClick={onClick}
      title={readOnly ? "Somente leitura — copie músicas para pastas custom" : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
        active ?
          "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        : isOver ?
          "bg-violet-100 ring-2 ring-violet-400 dark:bg-violet-950"
        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {cor ?
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold"
          style={{ backgroundColor: cor, color: readableText(cor) }}
        >
          {emoji ?? "📁"}
        </span>
      : <span className="flex h-7 w-7 shrink-0 items-center justify-center text-base">{emoji ?? "📁"}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {subtitle ?
          <span className={`block truncate text-[10px] ${active ? "opacity-80" : "text-slate-500"}`}>{subtitle}</span>
        : null}
      </span>
      {badge != null && badge > 0 ?
        <span className={`shrink-0 text-[10px] font-semibold ${active ? "opacity-90" : "text-slate-400"}`}>
          {badge}
        </span>
      : null}
      {readOnly ?
        <span className="shrink-0 text-[9px] uppercase tracking-wide opacity-60">RO</span>
      : null}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</div>
  );
}

export function BibliotecaSidebar({
  active,
  onSelect,
  onPastasChange,
  refreshToken = 0,
}: {
  active: BibliotecaFolderKey;
  onSelect: (f: BibliotecaFolderKey) => void;
  onPastasChange?: () => void;
  refreshToken?: number;
}) {
  const [tree, setTree] = useState<BibliotecaSidebarTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [progOpen, setProgOpen] = useState<Record<string, boolean>>({});
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/criacao/biblioteca/sidebar");
      if (!res.ok) throw new Error();
      setTree((await res.json()) as BibliotecaSidebarTree);
    } catch {
      if (!opts?.silent) setTree(null);
    } finally {
      if (!opts?.silent) setLoading(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollTop;
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshToken > 0) void load({ silent: true });
  }, [refreshToken, load]);

  async function criarPasta() {
    const nome = novoNome.trim();
    if (!nome) return;
    setCriando(true);
    try {
      const res = await fetch("/api/criacao/biblioteca/pastas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { pasta: BibliotecaPastaView };
      setNovoNome("");
      await load();
      onPastasChange?.();
      onSelect({
        kind: "custom",
        id: data.pasta.id,
        label: data.pasta.nome,
        cor: data.pasta.cor,
        icone: data.pasta.icone,
        criativoIniciais: data.pasta.criativoIniciais,
      });
    } catch {
      window.alert("Não foi possível criar a pasta.");
    } finally {
      setCriando(false);
    }
  }

  const isActive = (f: BibliotecaFolderKey) => {
    if (f.kind !== active.kind) return false;
    if (f.kind === "all") return active.kind === "all";
    if (f.kind === "off" && active.kind === "off") return f.archiveId === active.archiveId;
    return "id" in f && "id" in active && f.id === active.id;
  };

  function groupOffsByCompetencia(offs: import("@/lib/criacao/atualizacaoArquivoService").BibliotecaOffSidebarItem[]) {
    const map = new Map<string, typeof offs>();
    for (const o of offs) {
      const k = o.competencia || "—";
      const list = map.get(k) ?? [];
      list.push(o);
      map.set(k, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }

  function renderOffTree(
    offs: import("@/lib/criacao/atualizacaoArquivoService").BibliotecaOffSidebarItem[],
    ctx: { programacaoId: string | null; programacaoNome: string; clienteNome: string },
    keyPrefix: string,
  ) {
    if (offs.length === 0) return null;
    const offOpenKey = `${keyPrefix}-offs`;
    const offOpen = progOpen[offOpenKey] ?? false;
    return (
      <div className="pl-3">
        <button
          type="button"
          onClick={() => setProgOpen((o) => ({ ...o, [offOpenKey]: !offOpen }))}
          className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-[11px] font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40"
        >
          <span>{offOpen ? "▾" : "▸"}</span>
          <span>OFFs ({offs.length})</span>
        </button>
        {offOpen ?
          groupOffsByCompetencia(offs).map(([comp, items]) => (
            <div key={comp} className="pl-2">
              <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{comp}</div>
              {items.map((off) => (
                <SidebarItem
                  key={off.archiveId}
                  active={isActive({
                    kind: "off",
                    archiveId: off.archiveId,
                    label: off.rotulo,
                    programacaoId: ctx.programacaoId,
                    programacaoNome: ctx.programacaoNome,
                    clienteNome: ctx.clienteNome,
                    competencia: off.competencia,
                    readOnly: true,
                  })}
                  label={off.rotulo}
                  subtitle="Faixas retiradas no OFF"
                  emoji="📤"
                  badge={off.musicaCount}
                  readOnly
                  onClick={() =>
                    onSelect({
                      kind: "off",
                      archiveId: off.archiveId,
                      label: off.rotulo,
                      programacaoId: ctx.programacaoId,
                      programacaoNome: ctx.programacaoNome,
                      clienteNome: ctx.clienteNome,
                      competencia: off.competencia,
                      readOnly: true,
                    })
                  }
                />
              ))}
            </div>
          ))
        : null}
      </div>
    );
  }

  if (loading && !tree) {
    return <div className="p-4 text-sm text-slate-500">Carregando pastas…</div>;
  }

  return (
    <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        <SidebarItem
          active={isActive({ kind: "all", label: "Biblioteca" })}
          label="Biblioteca"
          subtitle="Todas as músicas"
          emoji="🎵"
          onClick={() => onSelect({ kind: "all", label: "Biblioteca" })}
        />

        <SectionTitle>Tags</SectionTitle>
        {(tree?.tags ?? []).map((t) => (
          <SidebarItem
            key={t.id}
            active={isActive({ kind: "tag", id: t.id, label: t.nome, cor: t.cor })}
            label={t.nome}
            subtitle={t.criativoNome ? `[${t.criativoNome}]` : undefined}
            cor={t.cor}
            badge={t.usoCount}
            onClick={() =>
              onSelect({
                kind: "tag",
                id: t.id,
                label: t.nome,
                cor: t.cor,
                criativoNome: t.criativoNome,
              })
            }
          />
        ))}

        <SectionTitle>Pastas custom</SectionTitle>
        {(tree?.pastasCustom ?? []).map((p) => (
          <SidebarItem
            key={p.id}
            active={isActive({
              kind: "custom",
              id: p.id,
              label: p.nome,
              cor: p.cor,
              icone: p.icone,
              criativoIniciais: p.criativoIniciais,
            })}
            label={p.nome}
            subtitle={`[${p.criativoIniciais}] ${p.criativoNome}`}
            cor={p.cor}
            emoji={iconeBibliotecaPastaEmoji(p.icone)}
            badge={p.musicaCount}
            droppableId={folderDropTargetId({
              kind: "custom",
              id: p.id,
              label: p.nome,
              cor: p.cor,
              icone: p.icone,
              criativoIniciais: p.criativoIniciais,
            })}
            onClick={() =>
              onSelect({
                kind: "custom",
                id: p.id,
                label: p.nome,
                cor: p.cor,
                icone: p.icone,
                criativoIniciais: p.criativoIniciais,
              })
            }
          />
        ))}
        <div className="mt-1 flex gap-1 px-1">
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nova pasta…"
            className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            onKeyDown={(e) => {
              if (e.key === "Enter") void criarPasta();
            }}
          />
          <button
            type="button"
            disabled={criando || !novoNome.trim()}
            onClick={() => void criarPasta()}
            className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            +
          </button>
        </div>

        <SectionTitle>Pastas especiais</SectionTitle>
        {(tree?.pastasEspeciais ?? []).map((p) => (
          <SidebarItem
            key={p.id}
            active={isActive({ kind: "especial", id: p.id, label: p.nome, readOnly: true })}
            label={p.nome}
            emoji="✨"
            badge={p.musicaCount}
            readOnly
            onClick={() => onSelect({ kind: "especial", id: p.id, label: p.nome, readOnly: true })}
          />
        ))}

        <SectionTitle>Programações</SectionTitle>
        {(tree?.programacoes ?? []).map((prog) => {
          const open = progOpen[prog.id] ?? false;
          return (
            <div key={prog.id} className="mb-1">
              <button
                type="button"
                onClick={() => setProgOpen((o) => ({ ...o, [prog.id]: !open }))}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span>{open ? "▾" : "▸"}</span>
                <span className="truncate">
                  {prog.clienteNome} · {prog.nome}
                </span>
              </button>
              {open ?
                <>
                  {prog.pastas.map((pa) => (
                    <div key={pa.id} className="pl-3">
                      <SidebarItem
                        active={isActive({
                          kind: "prog",
                          id: pa.id,
                          label: pa.nome,
                          programacaoId: prog.id,
                          programacaoNome: prog.nome,
                          clienteNome: prog.clienteNome,
                          readOnly: true,
                        })}
                        label={pa.nome}
                        emoji="📂"
                        badge={pa.musicaCount}
                        readOnly
                        onClick={() =>
                          onSelect({
                            kind: "prog",
                            id: pa.id,
                            label: pa.nome,
                            programacaoId: prog.id,
                            programacaoNome: prog.nome,
                            clienteNome: prog.clienteNome,
                            readOnly: true,
                          })
                        }
                      />
                    </div>
                  ))}
                  {renderOffTree(prog.offs, {
                    programacaoId: prog.id,
                    programacaoNome: prog.nome,
                    clienteNome: prog.clienteNome,
                  }, prog.id)}
                </>
              : null}
            </div>
          );
        })}
        {(tree?.programacoesArquivadas ?? []).map((arq) => {
          const key = `arq-${arq.clienteNome}-${arq.programacaoNome}`;
          const open = progOpen[key] ?? false;
          return (
            <div key={key} className="mb-1 opacity-90">
              <button
                type="button"
                onClick={() => setProgOpen((o) => ({ ...o, [key]: !open }))}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <span>{open ? "▾" : "▸"}</span>
                <span className="truncate">
                  {arq.clienteNome} · {arq.programacaoNome} (excluída)
                </span>
              </button>
              {open ?
                renderOffTree(arq.offs, {
                  programacaoId: null,
                  programacaoNome: arq.programacaoNome,
                  clienteNome: arq.clienteNome,
                }, key)
              : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export function useBibliotecaSidebarReload() {
  return useCallback(() => {
    window.dispatchEvent(new CustomEvent("bib-sidebar-reload"));
  }, []);
}
