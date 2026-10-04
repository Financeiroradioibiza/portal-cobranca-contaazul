"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MusicaVotoLogRow = {
  id: string;
  portalClienteId: number;
  portalPdvId: number;
  pdvNome: string;
  clienteNome: string;
  voto: "like" | "dislike";
  createdAt: string;
};

function fmtWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function pdvTooltip(rows: MusicaVotoLogRow[], kind: "like" | "dislike"): string {
  const names = rows
    .filter((r) => r.voto === kind)
    .map((r) => r.pdvNome || `PDV ${r.portalPdvId}`)
    .filter(Boolean);
  if (names.length === 0) return "";
  const head = names.slice(0, 8).join(", ");
  return names.length > 8 ? `${head}… (+${names.length - 8})` : head;
}

function VotoBadge({
  musicaId,
  titulo,
  kind,
  count,
  programacaoId,
  onOpen,
}: {
  musicaId: string;
  titulo: string;
  kind: "like" | "dislike";
  count: number;
  programacaoId?: string | null;
  onOpen: (musicaId: string, titulo: string) => void;
}) {
  const [tip, setTip] = useState("");
  const loaded = useRef(false);
  const isLike = kind === "like";

  const loadTip = useCallback(async () => {
    if (loaded.current || count <= 0) return;
    loaded.current = true;
    try {
      const qs = programacaoId ? `?programacaoId=${encodeURIComponent(programacaoId)}` : "";
      const res = await fetch(`/api/criacao/biblioteca/${musicaId}/votos${qs}`, {
        credentials: "same-origin",
      });
      const data = res.ok ? await res.json() : null;
      const rows = Array.isArray((data as { votos?: unknown })?.votos) ?
        (data as { votos: MusicaVotoLogRow[] }).votos
      : [];
      const text = pdvTooltip(rows, kind);
      if (text) setTip(text);
    } catch {
      /* silencioso */
    }
  }, [musicaId, count, kind, programacaoId]);

  return (
    <button
      type="button"
      onMouseEnter={() => void loadTip()}
      onFocus={() => void loadTip()}
      onClick={() => onOpen(musicaId, titulo)}
      className={
        isLike ?
          "inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
        : "inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
      }
      title={
        tip ?
          `${count} ${kind}(s): ${tip} — clique para detalhes`
        : `${count} ${kind}(s) — passe o mouse para ver PDVs`
      }
    >
      {isLike ? "👍" : "👎"} {count}
    </button>
  );
}

export function MusicaVotosBadges({
  musicaId,
  titulo,
  likes,
  dislikes,
  programacaoId,
  onOpen,
}: {
  musicaId: string;
  titulo: string;
  likes: number;
  dislikes: number;
  programacaoId?: string | null;
  onOpen: (musicaId: string, titulo: string) => void;
}) {
  if (likes <= 0 && dislikes <= 0) return null;

  return (
    <span className="ml-2 inline-flex items-center gap-1">
      {likes > 0 ?
        <VotoBadge
          musicaId={musicaId}
          titulo={titulo}
          kind="like"
          count={likes}
          programacaoId={programacaoId}
          onOpen={onOpen}
        />
      : null}
      {dislikes > 0 ?
        <VotoBadge
          musicaId={musicaId}
          titulo={titulo}
          kind="dislike"
          count={dislikes}
          programacaoId={programacaoId}
          onOpen={onOpen}
        />
      : null}
    </span>
  );
}

export function MusicaVotosModal({
  musicaId,
  titulo,
  programacaoId,
  onClose,
}: {
  musicaId: string | null;
  titulo: string;
  programacaoId?: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<MusicaVotoLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!musicaId) return;
    setLoading(true);
    try {
      const qs =
        programacaoId ? `?programacaoId=${encodeURIComponent(programacaoId)}` : "";
      const res = await fetch(`/api/criacao/biblioteca/${musicaId}/votos${qs}`, {
        credentials: "same-origin",
      });
      const data = res.ok ? await res.json() : null;
      setRows(Array.isArray((data as { votos?: unknown })?.votos) ? (data as { votos: MusicaVotoLogRow[] }).votos : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [musicaId, programacaoId]);

  useEffect(() => {
    if (musicaId) void load();
    else setRows([]);
  }, [musicaId, load]);

  if (!musicaId) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="musica-votos-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(80vh,520px)] w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <h2 id="musica-votos-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Votos na faixa
            </h2>
            <p className="truncate text-xs text-slate-500">{titulo}</p>
            {programacaoId ?
              <p className="text-[10px] text-slate-400">Somente PDVs desta programação</p>
            : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-4">
          {loading ?
            <p className="text-sm text-slate-500">Carregando…</p>
          : rows.length === 0 ?
            <p className="text-sm text-slate-500">Nenhum voto registrado.</p>
          : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="text-lg" aria-hidden>
                    {r.voto === "like" ? "👍" : "👎"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {r.pdvNome || `PDV ${r.portalPdvId}`}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.clienteNome || `Cliente ${r.portalClienteId}`}
                    </div>
                  </div>
                  <time className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {fmtWhen(r.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          }
        </div>
      </div>
    </div>
  );
}
