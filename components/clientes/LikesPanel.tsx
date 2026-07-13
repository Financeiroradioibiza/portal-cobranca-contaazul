"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MusicaRankingRow,
  MusicaRankingSort,
  MusicaVotoFeedRow,
  MusicaVotoTipo,
} from "@/lib/criacao/musicaVotoService";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";

type ViewMode = "feed" | "ranking";

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

function pdvLabel(row: { pdvNome: string; portalPdvId: number }): string {
  const nome = row.pdvNome.trim() || "PDV";
  return `${nome} (${formatPortalPdvIdDisplay(row.portalPdvId)})`;
}

function clienteLabel(row: { clienteNome: string; portalClienteId: number }): string {
  const nome = row.clienteNome.trim();
  return nome ? `${nome} (${row.portalClienteId})` : String(row.portalClienteId);
}

export function LikesPanel() {
  const [view, setView] = useState<ViewMode>("feed");
  const [votoFilter, setVotoFilter] = useState<MusicaVotoTipo | "all">("all");
  const [rankingSort, setRankingSort] = useState<MusicaRankingSort>("most_liked");
  const [feed, setFeed] = useState<MusicaVotoFeedRow[]>([]);
  const [ranking, setRanking] = useState<MusicaRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const qs = new URLSearchParams({ view });
      if (view === "feed") qs.set("voto", votoFilter);
      else qs.set("sort", rankingSort);

      const res = await fetch(`/api/clientes/likes?${qs}`, { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        feed?: MusicaVotoFeedRow[];
        ranking?: MusicaRankingRow[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar.");

      if (view === "feed") {
        setFeed(Array.isArray(data.feed) ? data.feed : []);
        setRanking([]);
      } else {
        setRanking(Array.isArray(data.ranking) ? data.ranking : []);
        setFeed([]);
      }
    } catch (e) {
      setFeed([]);
      setRanking([]);
      setMsg(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, [view, votoFilter, rankingSort]);

  useEffect(() => {
    void load();
  }, [load]);

  const feedFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return feed;
    return feed.filter((r) =>
      [
        r.musicaTitulo,
        r.musicaArtista,
        r.clienteNome,
        r.pdvNome,
        String(r.portalClienteId),
        formatPortalPdvIdDisplay(r.portalPdvId),
        r.voto,
        fmtWhen(r.createdAt),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [feed, busca]);

  const rankingFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return ranking;
    return ranking.filter((r) =>
      [r.titulo, r.artista, String(r.likes), String(r.dislikes), fmtWhen(r.ultimoVotoAt)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ranking, busca]);

  const countLabel =
    view === "feed"
      ? `${feedFiltrado.length} voto${feedFiltrado.length === 1 ? "" : "s"}`
      : `${rankingFiltrado.length} faixa${rankingFiltrado.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Likes e dislikes enviados pelos players (Player 5) no ping. Cada PDV pode votar uma vez por
        faixa. Os mais recentes aparecem primeiro na aba «Últimos votos».
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`portal-btn ${view === "feed" ? "portal-btn--primary" : "portal-btn--secondary"}`}
          onClick={() => setView("feed")}
        >
          Últimos votos
        </button>
        <button
          type="button"
          className={`portal-btn ${view === "ranking" ? "portal-btn--primary" : "portal-btn--secondary"}`}
          onClick={() => setView("ranking")}
        >
          Por faixa
        </button>
      </div>

      {view === "feed" ?
        <div className="flex flex-wrap gap-2">
          {(["all", "like", "dislike"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                votoFilter === v
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
              onClick={() => setVotoFilter(v)}
            >
              {v === "all" ? "Todos" : v === "like" ? "👍 Gostei" : "👎 Não gostei"}
            </button>
          ))}
        </div>
      : <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              rankingSort === "most_liked"
                ? "bg-emerald-700 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            }`}
            onClick={() => setRankingSort("most_liked")}
          >
            Mais curtidas
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              rankingSort === "most_disliked"
                ? "bg-red-700 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            }`}
            onClick={() => setRankingSort("most_disliked")}
          >
            Menos curtidas
          </button>
        </div>
      }

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={
            view === "feed" ? "Buscar faixa, cliente, PDV…" : "Buscar faixa ou artista…"
          }
          className="portal-input min-w-[14rem] flex-1"
        />
        <button
          type="button"
          className="portal-btn portal-btn--secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Carregando…" : "Atualizar"}
        </button>
        <span className="text-sm text-slate-500">{countLabel}</span>
      </div>

      {msg ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {msg}
        </p>
      : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {view === "feed" ?
          <table className="portal-table w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className="w-12 text-left">Voto</th>
                <th className="text-left">Faixa</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">PDV</th>
                <th className="text-left whitespace-nowrap">Quando</th>
              </tr>
            </thead>
            <tbody>
              {loading ?
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              : feedFiltrado.length === 0 ?
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {feed.length === 0 ? "Nenhum voto registrado ainda." : "Nada encontrado na busca."}
                  </td>
                </tr>
              : feedFiltrado.map((r) => (
                  <tr key={r.id}>
                    <td className="text-lg" aria-label={r.voto === "like" ? "Gostei" : "Não gostei"}>
                      {r.voto === "like" ? "👍" : "👎"}
                    </td>
                    <td className="max-w-[16rem]">
                      <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {r.musicaTitulo}
                      </div>
                      <div className="truncate text-xs text-slate-500">{r.musicaArtista}</div>
                    </td>
                    <td>{clienteLabel(r)}</td>
                    <td>{pdvLabel(r)}</td>
                    <td className="whitespace-nowrap tabular-nums text-slate-500">{fmtWhen(r.createdAt)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        : <table className="portal-table w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className="text-left">Faixa</th>
                <th className="text-right whitespace-nowrap">👍</th>
                <th className="text-right whitespace-nowrap">👎</th>
                <th className="text-left whitespace-nowrap">Último voto</th>
              </tr>
            </thead>
            <tbody>
              {loading ?
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              : rankingFiltrado.length === 0 ?
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    {ranking.length === 0 ? "Nenhuma faixa com votos." : "Nada encontrado na busca."}
                  </td>
                </tr>
              : rankingFiltrado.map((r) => (
                  <tr key={r.musicaId}>
                    <td className="max-w-[20rem]">
                      <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {r.titulo}
                      </div>
                      <div className="truncate text-xs text-slate-500">{r.artista}</div>
                    </td>
                    <td className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {r.likes}
                    </td>
                    <td className="text-right font-semibold tabular-nums text-red-700 dark:text-red-400">
                      {r.dislikes}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-slate-500">
                      {fmtWhen(r.ultimoVotoAt)}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}
