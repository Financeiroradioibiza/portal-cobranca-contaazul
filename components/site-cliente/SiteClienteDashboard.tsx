"use client";

import { useCallback, useEffect, useState } from "react";
import { PDV_STATUS_META, type PdvPlayStatus } from "@/lib/site-cliente/pdvStatus";
import type {
  SiteClienteDashboardPayload,
  SiteClientePdvRow,
  SiteClienteProgramacaoResumo,
} from "@/lib/site-cliente/siteClienteDashboardService";
import type { PastaHorarioView } from "@/lib/site-cliente/pastaHorarios";
import { SiteClienteSemanaChart } from "@/components/site-cliente/SiteClienteSemanaChart";
import { RadioIbizaRMark } from "@/components/site-cliente/RadioIbizaRMark";
import { SiteClienteClienteBranding } from "@/components/site-cliente/SiteClienteClienteBranding";

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

const VINHETA_TIPO_LABEL: Record<string, string> = {
  tts: "TTS",
  audio: "Áudio",
  ia: "IA",
};

function HorariosList({ horarios }: { horarios: PastaHorarioView[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm text-white/75">
      {horarios.map((h, i) => (
        <li key={i} className="flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-white/50">{h.diasLabel}</span>
          <span className={h.tocandoSempre ? "font-medium text-emerald-300" : "text-cyan-200"}>
            {h.horarioLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProgramacaoResumoBlock({ prog }: { prog: SiteClienteProgramacaoResumo }) {
  return (
    <div className="border-b border-white/10 px-5 py-4">
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-xs uppercase text-white/50">Programação</div>
          <div className="mt-1 font-semibold">{prog.nome}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-xs uppercase text-white/50">Total de faixas</div>
          <div className="mt-1 text-2xl font-bold text-cyan-300">{prog.totalFaixas}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-xs uppercase text-white/50">Duração total</div>
          <div className="mt-1 text-2xl font-bold text-amber-300">{prog.totalHoras}h</div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-xs uppercase text-white/50">Músicas novas (ATL)</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">
            {prog.percentNovasAtl != null ? `${prog.percentNovasAtl}%` : "—"}
          </div>
          {prog.ultimaAtualizacaoRotulo ? (
            <div className="mt-1 text-xs text-white/50">
              {prog.ultimaAtualizacaoRotulo} · {fmtDt(prog.ultimaAtualizacao)}
            </div>
          ) : null}
        </div>
      </div>

      {prog.pastas.length > 0 ? (
        <div className="mb-4">
          <div className="mb-3 text-xs font-semibold uppercase text-white/50">Estilos (pastas)</div>
          <div className="space-y-3">
            {prog.pastas.map((p) => (
              <div
                key={p.nome}
                className="rounded-xl bg-violet-500/15 px-4 py-3 ring-1 ring-violet-400/25"
              >
                <div className="font-semibold text-violet-100">
                  {p.nome}
                  {p.selecionavel ? (
                    <span className="ml-2 rounded-full bg-amber-500/25 px-2 py-0.5 text-xs font-bold text-amber-100">
                      Selecionável
                    </span>
                  ) : null}
                  <span className="text-sm font-normal text-white/55">
                    {" "}
                    · {p.faixas} faixas · {p.duracaoMinutos} min
                  </span>
                </div>
                <HorariosList horarios={p.horarios} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {prog.vinhetas.length > 0 ? (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase text-white/50">Vinhetas</div>
          <div className="space-y-3">
            {prog.vinhetas.map((v) => (
              <div
                key={v.nome}
                className="rounded-xl bg-pink-500/15 px-4 py-3 ring-1 ring-pink-400/25"
              >
                <div className="font-semibold text-pink-100">
                  {v.nome}
                  <span className="ml-2 text-sm font-normal text-white/55">
                    · {VINHETA_TIPO_LABEL[v.tipo] ?? v.tipo}
                  </span>
                </div>
                <HorariosList horarios={v.horarios} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PdvCard({
  pdv,
  expanded,
  onToggle,
}: {
  pdv: SiteClientePdvRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = PDV_STATUS_META[pdv.status as PdvPlayStatus] ?? PDV_STATUS_META.offline;
  const cache = pdv.cachePercent ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20">
      <button
        type="button"
        className="w-full px-4 py-3 text-left"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{pdv.nome}</div>
            {pdv.cnpj ? <div className="mt-0.5 text-xs text-white/50">{pdv.cnpj}</div> : null}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${meta.className}`}>
            {meta.label}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
          <div>
            <span className="text-white/40">Cache </span>
            {cache != null ? `${cache}%` : "—"}
          </div>
          <div>
            <span className="text-white/40">Versão </span>
            {pdv.playerVersion ?? "—"}
          </div>
          <div className="col-span-2">
            <span className="text-white/40">Programação </span>
            {pdv.programacaoNome ?? "—"}
          </div>
          <div className="col-span-2">
            <span className="text-white/40">Estilo agora </span>
            <span className="font-medium text-fuchsia-200">{pdv.estiloAgora ?? "—"}</span>
          </div>
          <div>
            <span className="text-white/40">1ª conexão </span>
            {fmtDt(pdv.firstPingAt)}
          </div>
          <div>
            <span className="text-white/40">Último ping </span>
            {fmtDt(pdv.lastPingAt)}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
            style={{ width: `${cache}%` }}
          />
        </div>
        {pdv.agendamentos.length > 0 ? (
          <div className="mt-2 text-xs text-cyan-300/80">
            {expanded ? "Ocultar playlist" : "Ver playlist e horários"}
          </div>
        ) : null}
      </button>
      {expanded && pdv.agendamentos.length > 0 ? (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Playlist</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {pdv.agendamentos.map((a, i) => (
              <span
                key={`${a.pastaNome}-${i}`}
                className="inline-flex flex-col gap-0.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs"
              >
                <span className="font-medium">{a.pastaNome}</span>
                <span className="text-white/60">
                  {formatDiasSemana(a.diasSemana)} · {a.horaInicio}–{a.horaFim}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
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
        <td className="px-3 py-3 text-sm text-violet-200">{pdv.programacaoNome ?? "—"}</td>
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
          <td colSpan={9} className="px-4 py-4">
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

export function SiteClienteDashboard({ mobile = false }: { mobile?: boolean }) {
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
    window.location.href = mobile ? "/m/site-cliente/login" : "/site-cliente/login";
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
    <div className={mobile ? "space-y-6" : "space-y-8"}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {mobile ? (
            <RadioIbizaRMark size={40} className="mt-0.5" />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm text-white/60">{data.grupoNome}</p>
            <h1 className={`font-bold ${mobile ? "text-xl" : "text-2xl"}`}>Olá, {data.usuarioNome}</h1>
            <p className="text-xs text-white/50">
              Atualizado {fmtDt(data.geradoEm)} · somente leitura
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
        >
          Sair
        </button>
      </header>

      {mobile ? (
        <p className="text-center text-xs text-white/40">
          <a href="/site-cliente?desktop=1" className="underline hover:text-white/70">
            Ver versão desktop
          </a>
        </p>
      ) : null}

      {data.clientes.map((cliente) => (
        <section
          key={cliente.key}
          className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950/80 via-violet-950/60 to-fuchsia-950/50 shadow-xl"
        >
          <div className="border-b border-white/10 bg-white/5 px-5 py-4">
            <SiteClienteClienteBranding
              clienteNome={cliente.nome}
              logoUrl={cliente.logoUrl}
              documento={cliente.documento}
              compact={mobile}
              moodboardSlot={
                data.permissoes.verMoodboard ? (
                  <button
                    type="button"
                    onClick={() => void openMoodboard(cliente.rioLinhaId)}
                    className="rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-bold text-white shadow-lg"
                  >
                    Moodboard
                  </button>
                ) : undefined
              }
            />
          </div>

          {cliente.programacoes.length > 0 && data.permissoes.verResumoProgramacao
            ? cliente.programacoes.map((prog) => (
                <ProgramacaoResumoBlock key={prog.programacaoId} prog={prog} />
              ))
            : null}

          {data.permissoes.verStatusPdvs && cliente.pdvs.length > 0 ? (
            mobile ? (
              <div className="space-y-3 px-4 py-4">
                {cliente.pdvs.map((pdv) => (
                  <PdvCard
                    key={pdv.rioPdvKey}
                    pdv={pdv}
                    expanded={expandedPdv === pdv.rioPdvKey}
                    onToggle={() =>
                      setExpandedPdv((k) => (k === pdv.rioPdvKey ? null : pdv.rioPdvKey))
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto px-2 py-4">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-white/50">
                      <th className="px-3 py-2">PDV</th>
                      <th className="px-3 py-2">CNPJ</th>
                      <th className="px-3 py-2">Cache</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Programação</th>
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
            )
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
        <div className={`fixed inset-0 z-50 flex bg-black/60 ${mobile ? "items-end" : "items-center justify-center p-4"}`}>
          <div className={`w-full bg-gradient-to-br from-fuchsia-600 to-violet-700 p-1 shadow-2xl ${mobile ? "rounded-t-2xl" : "max-w-md rounded-2xl"}`}>
            <div className={`rounded-[14px] bg-slate-900 p-6 text-white ${mobile ? "max-h-[85vh] overflow-y-auto rounded-t-[14px]" : ""}`}>
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
