"use client";

import { useCallback, useEffect, useState } from "react";
import { PDV_STATUS_META, type PdvPlayStatus } from "@/lib/site-cliente/pdvStatus";
import type { SiteClienteDashboardPayload, SiteClientePdvRow } from "@/lib/site-cliente/siteClienteDashboardService";
import { SiteClienteSemanaChart } from "@/components/site-cliente/SiteClienteSemanaChart";

const DOW_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatDiasSemana(csv: string): string {
  if (!csv.trim()) return "todos os dias";
  const dias = csv
   .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (dias.length >= 7) return "todos os dias";
  return dias.map((d) => DOW_FULL[d]?.slice(0, 3) ?? String(d)).join(", ");
}

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PdvRow({ pdv, expanded, onToggle }: { pdv: SiteClientePdvRow; expanded: boolean; onToggle: () => void }) {
  const meta = PDV_STATUS_META[pdv.status as PdvPlayStatus] ?? PDV_STATUS_META.offline;
  const cache = pdv.cachePercent ?? 0;

  return (
    <>
      <tr
        className="cursor-pointer border-b border-white/10 transition hover:bg-white/5"
        onClick={onToggle}
      >
        <td className="px-3 py-3 font-medium">{pdv.nome}</td>
        <td className="px-3 py-3 text-sm text-white/70">{pdv.cnpj || "—"}</td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                style={{ width: `${cache}%` }}
              />
            </div>
            <span className="text-xs text-white/60">{cache != null ? `${cache}%` : "—"}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${meta.className}`}>
            {meta.label}
          </span>
        </td>
        <td className="px-3 py-3 text-sm">{fmtDt(pdv.firstPingAt)}</td>
        <td className="px-3 py-3 text-sm">{fmtDt(pdv.lastPingAt)}</td>
        <td className="px-3 py-3 text-sm">{pdv.playerVersion ?? "—"}</td>
        <td className="px-3 py-3">
          <span className="rounded-lg bg-fuchsia-500/20 px-2 py-1 text-sm font-semibold text-fuchsia-100">
            {pdv.estiloAgora ?? "—"}
          </span>
        </td>
      </tr>
      {expanded && pdv.agendamentos.length > 0 ? (
        <tr className="bg-black/20">
          <td colSpan={8} className="px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Playlist</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {pdv.agendamentos.map((a, i) => (
                <span
                  key={`${a.pastaNome}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-sm"
                >
                  <span className="font-medium">{a.pastaNome}</span>
                  <span className="text-white/60">
                    {formatDiasSemana(a.diasSemana)} · {a.horaInicio}–{a.horaFim}
                  </span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function SiteClienteDashboard() {
  const [data, setData] = useState<SiteClienteDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedPdv, setExpandedPdv] = useState<string | null>(null);
  const [moodOpen, setMoodOpen] = useState<string | null>(null);
  const [moodData, setMoodData] = useState<{
    perfilPublico?: string;
    posicionamentoMarca?: string;
    estiloMusicalPrincipal?: string;
    objetivoPeriodo?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/site-cliente/dashboard");
      const json = (await res.json()) as SiteClienteDashboardPayload & { error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/site-cliente/auth/logout", { method: "POST" });
    window.location.href = "/site-cliente/login";
  }

  async function openMoodboard(rioLinhaId: string) {
    setMoodOpen(rioLinhaId);
    const res = await fetch(`/api/site-cliente/moodboard/${encodeURIComponent(rioLinhaId)}`);
    const json = (await res.json()) as {
      ok?: boolean;
      moodboard?: {
        perfilPublico?: string;
        posicionamentoMarca?: string;
        estiloMusicalPrincipal?: string;
        objetivoPeriodo?: string;
      };
    };
    setMoodData(json.moodboard ?? null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/70">
        Carregando painel…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-6 text-rose-100">
        {error || "Erro ao carregar dados."}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white/60">{data.grupoNome}</p>
          <h1 className="text-2xl font-bold">Olá, {data.usuarioNome}</h1>
          <p className="text-xs text-white/50">
            Atualizado {fmtDt(data.geradoEm)} · somente leitura
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
        >
          Sair
        </button>
      </header>

      {data.clientes.map((cliente) => (
        <section
          key={cliente.key}
          className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950/80 via-violet-950/60 to-fuchsia-950/50 shadow-xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-5 py-4">
            <div>
              <h2 className="text-xl font-bold">{cliente.nome}</h2>
              {cliente.documento ? (
                <p className="text-sm text-white/60">{cliente.documento}</p>
              ) : null}
            </div>
            {data.permissoes.verMoodboard ? (
              <button
                type="button"
                onClick={() => void openMoodboard(cliente.rioLinhaId)}
                className="rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-bold text-white shadow-lg"
              >
                Moodboard
              </button>
            ) : null}
          </div>

          {cliente.programacao && data.permissoes.verResumoProgramacao ? (
            <div className="grid gap-4 border-b border-white/10 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-xs uppercase text-white/50">Programação</div>
                <div className="mt-1 font-semibold">{cliente.programacao.nome}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-xs uppercase text-white/50">Total de faixas</div>
                <div className="mt-1 text-2xl font-bold text-cyan-300">
                  {cliente.programacao.totalFaixas}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-xs uppercase text-white/50">Duração total</div>
                <div className="mt-1 text-2xl font-bold text-amber-300">
                  {cliente.programacao.totalHoras}h
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-xs uppercase text-white/50">Músicas novas (ATL)</div>
                <div className="mt-1 text-2xl font-bold text-emerald-300">
                  {cliente.programacao.percentNovasAtl != null
                    ? `${cliente.programacao.percentNovasAtl}%`
                    : "—"}
                </div>
                {cliente.programacao.ultimaAtualizacaoRotulo ? (
                  <div className="mt-1 text-xs text-white/50">
                    {cliente.programacao.ultimaAtualizacaoRotulo} ·{" "}
                    {fmtDt(cliente.programacao.ultimaAtualizacao)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {cliente.programacao && data.permissoes.verResumoProgramacao ? (
            <div className="border-b border-white/10 px-5 py-4">
              <div className="mb-2 text-xs font-semibold uppercase text-white/50">Estilos (pastas)</div>
              <div className="flex flex-wrap gap-2">
                {cliente.programacao.pastas.map((p) => (
                  <span
                    key={p.nome}
                    className="rounded-lg bg-violet-500/20 px-3 py-1 text-sm ring-1 ring-violet-400/30"
                  >
                    {p.nome} · {p.faixas} faixas · {p.duracaoMinutos} min
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {data.permissoes.verStatusPdvs && cliente.pdvs.length > 0 ? (
            <div className="overflow-x-auto px-2 py-4">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-white/50">
                    <th className="px-3 py-2">PDV</th>
                    <th className="px-3 py-2">CNPJ</th>
                    <th className="px-3 py-2">Cache</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">1ª conexão</th>
                    <th className="px-3 py-2">Último ping</th>
                    <th className="px-3 py-2">Versão</th>
                    <th className="px-3 py-2">Estilo agora</th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.pdvs.map((pdv) => (
                    <PdvRow
                      key={pdv.rioPdvKey}
                      pdv={pdv}
                      expanded={expandedPdv === pdv.rioPdvKey}
                      onToggle={() =>
                        setExpandedPdv((k) => (k === pdv.rioPdvKey ? null : pdv.rioPdvKey))
                      }
                    />
                  ))}
                </tbody>
              </table>
              <p className="px-3 text-xs text-white/40">Clique na linha para ver a playlist e horários.</p>
            </div>
          ) : null}

          {data.permissoes.verGraficoSemana && cliente.semanaBlocos.length > 0 ? (
            <div className="border-t border-white/10 p-5">
              <SiteClienteSemanaChart
                clienteNome={cliente.nome}
                blocos={cliente.semanaBlocos}
                canExport={data.permissoes.exportarPdf}
              />
            </div>
          ) : null}

          {data.permissoes.verAtualizacoes && cliente.atualizacoes.length > 0 ? (
            <div className="border-t border-white/10 p-5">
              <h3 className="mb-3 font-semibold">Logs de atualização</h3>
              <ul className="space-y-2 text-sm">
                {cliente.atualizacoes.map((a) => (
                  <li key={a.id} className="rounded-lg bg-white/5 px-3 py-2">
                    <strong>{a.rotulo}</strong> · {fmtDt(a.quando)}
                    {a.detalhe ? ` · ${a.detalhe}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-white/10 p-5 md:grid-cols-2">
            {data.permissoes.verFeedback ? (
              <div className="rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-400/20">
                <h3 className="mb-3 font-semibold text-amber-100">Feedback</h3>
                {cliente.feedbacks.length === 0 ? (
                  <p className="text-sm text-white/50">Nenhum feedback ainda.</p>
                ) : (
                  <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                    {cliente.feedbacks.map((f) => (
                      <li key={f.id} className="rounded-lg bg-black/20 px-3 py-2">
                        <div className="text-xs text-white/50">
                          {f.pdvNome} · {fmtDt(f.quando)}
                        </div>
                        {f.mensagem}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {data.permissoes.verLikes ? (
              <div className="rounded-xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/20">
                <h3 className="mb-3 font-semibold text-emerald-100">Likes & dislikes</h3>
                {cliente.votos.length === 0 ? (
                  <p className="text-sm text-white/50">Nenhum voto ainda.</p>
                ) : (
                  <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                    {cliente.votos.map((v) => (
                      <li key={v.id} className="flex items-start gap-2 rounded-lg bg-black/20 px-3 py-2">
                        <span>{v.voto === "like" ? "👍" : "👎"}</span>
                        <div>
                          <div className="font-medium">
                            {v.musicaTitulo} — {v.musicaArtista}
                          </div>
                          <div className="text-xs text-white/50">
                            {v.pdvNome} · {fmtDt(v.quando)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </section>
      ))}

      {moodOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-700 p-1 shadow-2xl">
            <div className="rounded-[14px] bg-slate-900 p-6 text-white">
              <h3 className="text-lg font-bold">Moodboard estratégico</h3>
              {moodData ? (
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ["Perfil do público", moodData.perfilPublico],
                    ["Posicionamento", moodData.posicionamentoMarca],
                    ["Estilo musical", moodData.estiloMusicalPrincipal],
                    ["Objetivo do período", moodData.objetivoPeriodo],
                  ].map(([label, val]) => (
                    <div key={String(label)}>
                      <dt className="text-xs uppercase text-white/50">{label}</dt>
                      <dd className="mt-1">{val || "—"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 text-white/60">Moodboard ainda não configurado.</p>
              )}
              <button
                type="button"
                className="mt-6 w-full rounded-lg bg-white/10 py-2 text-sm hover:bg-white/20"
                onClick={() => {
                  setMoodOpen(null);
                  setMoodData(null);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
