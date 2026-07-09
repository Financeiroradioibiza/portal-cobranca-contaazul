"use client";

import { useCallback, useEffect, useState } from "react";

type BibRow = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  bpm: number | null;
  tagsManuais: { id: string; nome: string; cor: string; criativoIniciais: string }[];
  tagsAuto: { fonte: string; chave?: string; valor: string }[];
};

type TagChip = { id: string; nome: string; cor: string; criativoNome: string };

function tagChipTextColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#0f172a";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0f172a" : "#f8fafc";
}

export function AddMusicasBibliotecaModal({
  title,
  subtitle,
  getDisabledReason,
  onClose,
  onConfirm,
}: {
  title: string;
  subtitle?: string;
  getDisabledReason?: (musicaId: string) => string | null;
  onClose: () => void;
  onConfirm: (musicaIds: string[]) => void | Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState("");
  const [tagIdFilter, setTagIdFilter] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagChip[]>([]);
  const [rows, setRows] = useState<BibRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/criacao/tags")
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d: { tags?: TagChip[] }) => setAllTags(d.tags ?? []))
      .catch(() => setAllTags([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100", status: "pronta" });
      if (busca.trim()) params.set("search", busca.trim());
      if (tagIdFilter) params.set("tagId", tagIdFilter);
      const res = await fetch(`/api/criacao/biblioteca?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { musicas: BibRow[] };
      setRows(data.musicas);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [busca, tagIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    if (getDisabledReason?.(id)) return;
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    if (sel.size === 0) return;
    setSaving(true);
    try {
      await onConfirm(Array.from(sel));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold">{title}</h2>
            {subtitle ?
              <p className="text-xs text-slate-500">{subtitle}</p>
            : null}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusca(draft);
          }}
          className="flex gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"
        >
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Buscar título, artista, ISRC, tag, gravadora, BPM, estilo…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Buscar
          </button>
        </form>
        {allTags.length > 0 ?
          <div className="max-h-24 overflow-y-auto border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Filtrar por tag
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => {
                const active = tagIdFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTagIdFilter(active ? null : t.id)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                      active ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : "opacity-90 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: t.cor, color: tagChipTextColor(t.cor) }}
                    title={t.criativoNome ? `[${t.criativoNome}] ${t.nome}` : t.nome}
                  >
                    {t.criativoNome ? `[${t.criativoNome}] ` : ""}
                    {t.nome}
                  </button>
                );
              })}
              {tagIdFilter ?
                <button
                  type="button"
                  onClick={() => setTagIdFilter(null)}
                  className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 dark:border-slate-600"
                >
                  Limpar tag
                </button>
              : null}
            </div>
          </div>
        : null}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ?
            <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
          : rows.length === 0 ?
            <div className="py-8 text-center text-sm text-slate-400">Nenhuma faixa pronta encontrada.</div>
          : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((m) => {
                const disabledReason = getDisabledReason?.(m.id) ?? null;
                const already = Boolean(disabledReason);
                const checked = sel.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => toggle(m.id)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                        already ? "opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          checked ?
                            "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                          : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {m.titulo || "(sem título)"}
                        </div>
                        <div className="truncate text-xs text-slate-500">{m.artista || "—"}</div>
                        {(m.tagsManuais?.length ?? 0) > 0 || (m.tagsAuto?.length ?? 0) > 0 ?
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {m.tagsManuais?.slice(0, 4).map((t) => (
                              <span
                                key={t.id}
                                className="rounded px-1 py-px text-[9px] font-bold"
                                style={{ backgroundColor: t.cor, color: tagChipTextColor(t.cor) }}
                              >
                                {t.criativoIniciais ? `${t.criativoIniciais} ` : ""}
                                {t.nome}
                              </span>
                            ))}
                            {m.tagsAuto?.slice(0, 3).map((t, i) => (
                              <span
                                key={`${t.fonte}-${t.chave ?? ""}-${t.valor}-${i}`}
                                className="rounded bg-slate-100 px-1 py-px text-[9px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              >
                                {t.valor}
                              </span>
                            ))}
                          </div>
                        : null}
                      </div>
                      {already ?
                        <span className="shrink-0 text-[10px] text-slate-400">{disabledReason}</span>
                      : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          }
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-xs text-slate-500">
            {sel.size} selecionada{sel.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => void add()}
            disabled={sel.size === 0 || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {saving ? "Adicionando…" : `Adicionar ${sel.size || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
