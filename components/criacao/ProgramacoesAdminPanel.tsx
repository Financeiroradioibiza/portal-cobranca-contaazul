"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FORMATO_LABEL } from "@/lib/criacao/programacaoService";
import { CriativoTagSelect } from "@/components/criacao/CriativoTagSelect";
import { VinhetaAudioControls } from "@/components/criacao/VinhetaAudioControls";
import { marcarAtualizacaoAberta } from "@/lib/criacao/marcarAtualizacaoAbertaClient";
import { uploadVinhetaAudio, vinhetaUploadErrorMessage } from "@/lib/criacao/vinhetaUploadClient";

type Cliente = { ref: string; nome: string; pdvCount: number };

type ArvorePasta = { id: string; nome: string; velocidade: string; musicasCount: number };
type ArvoreVinheta = {
  id: string;
  nome: string;
  tipo: string;
  temAudio: boolean;
  previewUrl: string | null;
};
type ArvoreProg = {
  id: string;
  nome: string;
  formatoPadrao: string;
  publicada: boolean;
  atualizacaoAberta: boolean;
  pastas: ArvorePasta[];
  vinhetas: ArvoreVinheta[];
};

type AtualizacaoAbertaRow = {
  programacaoId: string;
  programacaoNome: string;
  clienteRef: string;
  clienteNome: string;
  abertaEm: string;
  abertaPor: string;
  publicada: boolean;
};

type PdvProgramacaoRow = {
  rioPdvKey: string;
  nome: string;
  portalPdvId: number | null;
  codigoDisplay: string;
  programacaoId: string | null;
  programacaoNome: string | null;
  isLinhaProxy: boolean;
};

type ProgOption = { id: string; nome: string };

const FORMATOS = ["mp3_128_mono", "mp3_128_stereo", "mp3_192_mono", "mp3_192_stereo"];
const VELOCIDADE_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

function progEncerrada(prog: Pick<ArvoreProg, "publicada" | "atualizacaoAberta">): boolean {
  return prog.publicada && !prog.atualizacaoAberta;
}

export function ProgramacoesAdminPanel({ onOpenEditor }: { onOpenEditor: (programacaoId: string) => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [arvore, setArvore] = useState<ArvoreProg[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [loadingArvore, setLoadingArvore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNovaProg, setShowNovaProg] = useState(false);
  const [fecharProg, setFecharProg] = useState<{ id: string; nome: string } | null>(null);
  const [logAberto, setLogAberto] = useState<Set<string>>(new Set());
  const [atualizacoesAbertas, setAtualizacoesAbertas] = useState<AtualizacaoAbertaRow[]>([]);
  const [focusProgId, setFocusProgId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/criacao/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.clientes) setClientes(d.clientes as Cliente[]);
      })
      .finally(() => setLoadingClientes(false));
  }, []);

  const loadAtualizacoesAbertas = useCallback(async () => {
    try {
      const res = await fetch("/api/criacao/atualizacoes-abertas");
      if (!res.ok) return;
      const data = (await res.json()) as { atualizacoes?: AtualizacaoAbertaRow[] };
      setAtualizacoesAbertas(data.atualizacoes ?? []);
    } catch {
      setAtualizacoesAbertas([]);
    }
  }, []);

  useEffect(() => {
    void loadAtualizacoesAbertas();
  }, [loadAtualizacoesAbertas]);

  const loadArvore = useCallback(async (ref: string) => {
    setLoadingArvore(true);
    try {
      const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(ref)}/arvore`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { arvore: ArvoreProg[] };
      setArvore(data.arvore);
      setExpanded(new Set(data.arvore.map((p) => p.id)));
    } catch {
      setArvore([]);
    } finally {
      setLoadingArvore(false);
    }
  }, []);

  useEffect(() => {
    if (clienteSel) void loadArvore(clienteSel.ref);
    else setArvore([]);
  }, [clienteSel, loadArvore]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q)) : clientes;
    return base.slice(0, 80);
  }, [clientes, clienteBusca]);

  const stats = useMemo(() => {
    const progs = arvore.length;
    const pastas = arvore.reduce((a, p) => a + p.pastas.length, 0);
    const vinhetas = arvore.reduce((a, p) => a + p.vinhetas.length, 0);
    const faixas = arvore.reduce((a, p) => a + p.pastas.reduce((b, f) => b + f.musicasCount, 0), 0);
    return { progs, pastas, vinhetas, faixas };
  }, [arvore]);

  const openProgramacaoIds = useMemo(() => {
    const ids = new Set(arvore.filter((p) => p.atualizacaoAberta).map((p) => p.id));
    if (clienteSel) {
      for (const a of atualizacoesAbertas) {
        if (a.clienteRef === clienteSel.ref) ids.add(a.programacaoId);
      }
    }
    return ids;
  }, [arvore, atualizacoesAbertas, clienteSel]);
  const encerradaProgramacaoIds = useMemo(
    () => new Set(arvore.filter((p) => progEncerrada(p)).map((p) => p.id)),
    [arvore],
  );

  const marcouAbertaIds = useRef(new Set<string>());

  async function marcarEdicaoProgramacao(progId: string) {
    if (marcouAbertaIds.current.has(progId)) return;
    marcouAbertaIds.current.add(progId);
    const ok = await marcarAtualizacaoAberta(progId);
    if (ok) {
      await loadAtualizacoesAbertas();
      if (clienteSel) await loadArvore(clienteSel.ref);
    }
  }

  function abrirAtualizacao(progId: string) {
    onOpenEditor(progId);
  }

  function irParaAtualizacaoAberta(row: AtualizacaoAbertaRow) {
    const c = clientes.find((x) => x.ref === row.clienteRef);
    setClienteSel(c ?? { ref: row.clienteRef, nome: row.clienteNome, pdvCount: 0 });
    setFocusProgId(row.programacaoId);
    setExpanded((prev) => new Set(prev).add(row.programacaoId));
  }

  useEffect(() => {
    if (!focusProgId) return;
    const el = document.getElementById(`prog-row-${focusProgId}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = window.setTimeout(() => setFocusProgId(null), 2000);
    return () => window.clearTimeout(t);
  }, [focusProgId, arvore, clienteSel]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function excluirProgramacao(id: string, nome: string) {
    if (!confirm(`Excluir programação “${nome}” e todas as pastas?`)) return;
    await fetch(`/api/criacao/programacoes/${id}`, { method: "DELETE" });
    if (clienteSel) await loadArvore(clienteSel.ref);
  }

  async function excluirPasta(progId: string, id: string, nome: string) {
    if (!confirm(`Excluir pasta “${nome}”?`)) return;
    await marcarEdicaoProgramacao(progId);
    await fetch(`/api/criacao/pastas/${id}`, { method: "DELETE" });
    if (clienteSel) await loadArvore(clienteSel.ref);
  }

  async function excluirVinheta(progId: string, id: string, nome: string) {
    if (!confirm(`Excluir vinheta “${nome}”?`)) return;
    await marcarEdicaoProgramacao(progId);
    await fetch(`/api/criacao/vinhetas/${id}`, { method: "DELETE" });
    if (clienteSel) await loadArvore(clienteSel.ref);
  }

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-6 sm:px-4">
      <div className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Criação / Programações
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Central de programações</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Organize por cliente da produção: programações musicais, pastas (playlists) e vinhetas.
          Depois de montar aqui, escolha a pasta no <strong>Upload</strong> para enviar faixas direto.
        </p>
      </div>

      {atualizacoesAbertas.length > 0 ?
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50/90 px-4 py-3 shadow-sm dark:border-orange-900/60 dark:bg-orange-950/30">
          <div className="text-[10px] font-bold uppercase tracking-widest text-orange-800 dark:text-orange-300">
            Atualizações abertas
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {atualizacoesAbertas.map((a) => {
              const ativo = clienteSel?.ref === a.clienteRef && focusProgId === a.programacaoId;
              return (
                <button
                  key={a.programacaoId}
                  type="button"
                  onClick={() => irParaAtualizacaoAberta(a)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition " +
                    (ativo ?
                      "border-orange-600 bg-orange-500 text-white"
                    : "border-orange-300 bg-white text-orange-900 hover:border-orange-400 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100 dark:hover:bg-orange-900/40")
                  }
                >
                  <span className="block truncate">{a.programacaoNome}</span>
                  <span className="block truncate text-[10px] font-normal opacity-80">{a.clienteNome}</span>
                </button>
              );
            })}
          </div>
        </div>
      : null}

      <div className="grid min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[minmax(240px,280px)_minmax(260px,320px)_1fr] lg:grid-cols-[minmax(240px,280px)_1fr]">
        {/* Coluna clientes — estilo Central de Suporte */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#faf8f5] shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 bg-[#f5f0e8] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/80">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Clientes produção
            </div>
            <input
              value={clienteBusca}
              onChange={(e) => setClienteBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {loadingClientes ?
              <li className="px-3 py-6 text-sm text-slate-500">Carregando…</li>
            : clientesFiltrados.length === 0 ?
              <li className="px-3 py-6 text-sm text-slate-500">Nenhum cliente.</li>
            : clientesFiltrados.map((c) => {
                const on = clienteSel?.ref === c.ref;
                return (
                  <li key={c.ref}>
                    <button
                      type="button"
                      onClick={() => setClienteSel(c)}
                      className={
                        "flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm transition dark:border-slate-800 " +
                        (on ?
                          "bg-amber-100/80 font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                        : "hover:bg-white/80 dark:hover:bg-slate-800/50")
                      }
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white dark:bg-slate-700">
                        {c.nome.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.nome}</span>
                        <span className="text-[10px] text-slate-500">{c.pdvCount} PDV</span>
                      </span>
                    </button>
                  </li>
                );
              })
            }
          </ul>
        </div>

        {/* Coluna PDVs — amarração programação por loja */}
        {clienteSel ?
          <PdvProgramacaoColumn
            clienteRef={clienteSel.ref}
            clienteNome={clienteSel.nome}
            openProgramacaoIds={openProgramacaoIds}
            encerradaProgramacaoIds={encerradaProgramacaoIds}
          />
        : null}

        {/* Coluna hierarquia */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!clienteSel ?
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
              Selecione um cliente à esquerda para ver e organizar programações, pastas e vinhetas.
            </div>
          : <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f5f0e8] px-4 py-3 dark:border-slate-800 dark:bg-slate-800/80">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {clienteSel.nome}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-slate-600 dark:text-slate-400">
                    <span>{stats.progs} prog.</span>
                    <span>{stats.pastas} pastas</span>
                    <span>{stats.vinhetas} vinhetas</span>
                    <span>{stats.faixas} faixas</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNovaProg(true)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  + Nova programação
                </button>
              </div>

              {showNovaProg ?
                <NovaProgramacaoInline
                  cliente={clienteSel}
                  onClose={() => setShowNovaProg(false)}
                  onCreated={async () => {
                    setShowNovaProg(false);
                    await loadArvore(clienteSel.ref);
                  }}
                />
              : null}

              {loadingArvore ?
                <div className="p-8 text-sm text-slate-500">Carregando hierarquia…</div>
              : arvore.length === 0 ?
                <div className="p-8 text-center text-sm text-slate-500">
                  Nenhuma programação para este cliente. Crie a primeira acima.
                </div>
              : <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                  {arvore.map((prog) => (
                    <li
                      key={prog.id}
                      id={`prog-row-${prog.id}`}
                      className={
                        "px-2 py-2 transition " +
                        (focusProgId === prog.id ? "rounded-lg bg-orange-50 ring-2 ring-orange-300 dark:bg-orange-950/30 dark:ring-orange-800" : "")
                      }
                    >
                      <div className="flex items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <button
                          type="button"
                          onClick={() => toggleExpand(prog.id)}
                          className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-700"
                          aria-label={expanded.has(prog.id) ? "Recolher" : "Expandir"}
                        >
                          {expanded.has(prog.id) ? "▾" : "▸"}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base">🎼</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{prog.nome}</span>
                            {prog.atualizacaoAberta ?
                              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                                Aberta
                              </span>
                            : progEncerrada(prog) ?
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                Encerrada
                              </span>
                            : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800">
                                Rascunho
                              </span>
                            }
                            <span className="text-[10px] text-slate-400">
                              {FORMATO_LABEL[prog.formatoPadrao as keyof typeof FORMATO_LABEL] ?? prog.formatoPadrao}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => void abrirAtualizacao(prog.id)}
                              className={
                                "rounded border px-2 py-0.5 text-[10px] font-semibold transition " +
                                (prog.atualizacaoAberta ?
                                  "border-orange-500 bg-orange-50 text-orange-900 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
                                : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300")
                              }
                            >
                              Abrir atualização
                            </button>
                            <button
                              type="button"
                              onClick={() => setFecharProg({ id: prog.id, nome: prog.nome })}
                              className={
                                "rounded border px-2 py-0.5 text-[10px] font-semibold transition " +
                                (prog.atualizacaoAberta ?
                                  "border-orange-600 bg-orange-500 text-white hover:bg-orange-600 dark:border-orange-700 dark:bg-orange-600"
                                : progEncerrada(prog) ?
                                  "border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                                : "border-slate-300 text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400")
                              }
                            >
                              Fechar atualização
                            </button>
                            <NovaPastaInline
                              programacaoId={prog.id}
                              onEdit={() => marcarEdicaoProgramacao(prog.id)}
                              onDone={() => loadArvore(clienteSel.ref)}
                            />
                            <NovaVinhetaInline
                              programacaoId={prog.id}
                              onEdit={() => marcarEdicaoProgramacao(prog.id)}
                              onDone={() => loadArvore(clienteSel.ref)}
                            />
                            <button
                              type="button"
                              onClick={() => void excluirProgramacao(prog.id, prog.nome)}
                              className="rounded px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              excluir
                            </button>
                          </div>
                        </div>
                      </div>

                      {expanded.has(prog.id) ?
                        <ul className="ms-6 mt-1 space-y-0.5 border-s border-slate-200 ps-3 dark:border-slate-700">
                          {prog.pastas.map((pasta) => (
                            <li key={pasta.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <span className="text-slate-400">📁</span>
                              <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                                {pasta.nome}
                              </span>
                              <span className="shrink-0 text-[10px] text-slate-400">
                                {VELOCIDADE_LABEL[pasta.velocidade] ?? pasta.velocidade}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                                {pasta.musicasCount} faixa{pasta.musicasCount === 1 ? "" : "s"}
                              </span>
                              <button
                                type="button"
                                onClick={() => void excluirPasta(prog.id, pasta.id, pasta.nome)}
                                className="shrink-0 text-[10px] text-red-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                          {prog.vinhetas.map((v) => (
                            <li key={v.id} className="flex flex-wrap items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <span className="text-slate-400">{v.tipo === "audio" ? "🔊" : "🗣"}</span>
                              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{v.nome}</span>
                              <span className="shrink-0 text-[10px] uppercase text-slate-400">{v.tipo}</span>
                              {v.tipo === "audio" ?
                                <span
                                  className={
                                    "shrink-0 rounded px-1 py-px text-[9px] font-bold " +
                                    (v.temAudio ?
                                      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300")
                                  }
                                >
                                  {v.temAudio ? "com áudio" : "sem áudio"}
                                </span>
                              : null}
                              <VinhetaAudioControls
                                vinhetaId={v.id}
                                tipo={v.tipo}
                                temAudio={v.temAudio}
                                previewUrl={v.previewUrl}
                                compact
                                onUploaded={async () => {
                                  await marcarEdicaoProgramacao(prog.id);
                                  if (clienteSel) await loadArvore(clienteSel.ref);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => void excluirVinheta(prog.id, v.id, v.nome)}
                                className="shrink-0 text-[10px] text-red-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                          {prog.pastas.length === 0 && prog.vinhetas.length === 0 ?
                            <li className="px-2 py-2 text-xs text-slate-400">Sem pastas nem vinhetas — crie acima.</li>
                          : null}
                          <li className="pt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setLogAberto((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(prog.id)) n.delete(prog.id);
                                  else n.add(prog.id);
                                  return n;
                                })
                              }
                              className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                            >
                              {logAberto.has(prog.id) ? "▾ Log de atualizações" : "▸ Log de atualizações"}
                            </button>
                            {logAberto.has(prog.id) ?
                              <AtualizacaoLogPanel programacaoId={prog.id} />
                            : null}
                          </li>
                        </ul>
                      : null}
                    </li>
                  ))}
                </ul>
              }
            </>
          }
        </div>
      </div>

      {fecharProg && clienteSel ?
        <FecharAtualizacaoModal
          programacaoId={fecharProg.id}
          programacaoNome={fecharProg.nome}
          clienteRef={clienteSel.ref}
          clienteNome={clienteSel.nome}
          onClose={() => setFecharProg(null)}
          onDone={async () => {
            setFecharProg(null);
            await loadAtualizacoesAbertas();
            await loadArvore(clienteSel.ref);
            setLogAberto((prev) => new Set(prev).add(fecharProg.id));
          }}
        />
      : null}
    </div>
  );
}

function PdvProgramacaoColumn({
  clienteRef,
  clienteNome,
  openProgramacaoIds,
  encerradaProgramacaoIds,
}: {
  clienteRef: string;
  clienteNome: string;
  openProgramacaoIds: Set<string>;
  encerradaProgramacaoIds: Set<string>;
}) {
  const [pdvs, setPdvs] = useState<PdvProgramacaoRow[]>([]);
  const [programacoes, setProgramacoes] = useState<ProgOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(clienteRef)}/pdv-programacoes`);
      if (!res.ok) throw new Error("falha_carregar");
      const data = (await res.json()) as {
        pdvs?: PdvProgramacaoRow[];
        programacoes?: ProgOption[];
      };
      setPdvs(data.pdvs ?? []);
      setProgramacoes(data.programacoes ?? []);
    } catch {
      setPdvs([]);
      setProgramacoes([]);
      setError("Não foi possível carregar os PDVs.");
    } finally {
      setLoading(false);
    }
  }, [clienteRef]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(rioPdvKey: string, programacaoId: string | null) {
    setSavingKey(rioPdvKey);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(clienteRef)}/pdv-programacoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rioPdvKey, programacaoId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        pdvs?: PdvProgramacaoRow[];
        programacoes?: ProgOption[];
      };
      if (!res.ok) throw new Error(data.error ?? "falha_salvar");
      setPdvs(data.pdvs ?? []);
      setProgramacoes(data.programacoes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-auto lg:col-span-2 xl:col-span-1">
      <div className="border-b border-slate-200 bg-[#eef6ff] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/80">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          PDVs · {clienteNome}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          Escolha qual programação musical fica amarrada em cada loja. Laranja = atualização aberta; verde = enviada e
          encerrada.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading ?
          <p className="px-2 py-6 text-sm text-slate-500">Carregando PDVs…</p>
        : error ?
          <p className="px-2 py-4 text-sm text-red-600">{error}</p>
        : pdvs.length === 0 ?
          <p className="px-2 py-6 text-sm text-slate-500">Nenhum PDV neste cliente.</p>
        : <ul className="space-y-2">
            {pdvs.map((pdv) => (
              <li
                key={pdv.rioPdvKey}
                className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-950/40"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {pdv.nome}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {pdv.codigoDisplay}
                      {pdv.isLinhaProxy ? " · proxy linha" : ""}
                    </div>
                  </div>
                  {savingKey === pdv.rioPdvKey ?
                    <span className="shrink-0 text-[10px] text-slate-400">salvando…</span>
                  : pdv.programacaoNome ?
                    (() => {
                      const aberta = pdv.programacaoId != null && openProgramacaoIds.has(pdv.programacaoId);
                      const encerrada = pdv.programacaoId != null && encerradaProgramacaoIds.has(pdv.programacaoId);
                      return (
                        <span
                          className={
                            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold " +
                            (aberta ?
                              "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                            : encerrada ?
                              "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400")
                          }
                        >
                          {pdv.programacaoNome}
                        </span>
                      );
                    })()
                  : <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      sem prog.
                    </span>
                  }
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={savingKey === pdv.rioPdvKey}
                    onClick={() => void assign(pdv.rioPdvKey, null)}
                    className={
                      "rounded border px-2 py-1 text-[10px] font-semibold transition " +
                      (!pdv.programacaoId ?
                        "border-slate-400 bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                      : "border-slate-300 text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400")
                    }
                  >
                    Nenhuma
                  </button>
                  {programacoes.map((prog) => {
                    const on = pdv.programacaoId === prog.id;
                    const aberta = openProgramacaoIds.has(prog.id);
                    const encerrada = encerradaProgramacaoIds.has(prog.id);
                    return (
                      <button
                        key={prog.id}
                        type="button"
                        disabled={savingKey === pdv.rioPdvKey}
                        onClick={() => void assign(pdv.rioPdvKey, prog.id)}
                        className={
                          "rounded border px-2 py-1 text-[10px] font-semibold transition " +
                          (on && aberta ?
                            "border-orange-500 bg-orange-500 text-white"
                          : on && encerrada ?
                            "border-emerald-600 bg-emerald-600 text-white"
                          : on ?
                            "border-slate-600 bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900"
                          : aberta ?
                            "border-orange-300 text-orange-700 hover:border-orange-400 dark:border-orange-800 dark:text-orange-300"
                          : encerrada ?
                            "border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-300"
                          : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300")
                        }
                      >
                        {prog.nome}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        }
      </div>
    </div>
  );
}

function NovaProgramacaoInline({
  cliente,
  onClose,
  onCreated,
}: {
  cliente: Cliente;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [formato, setFormato] = useState("mp3_128_mono");
  const [tagCriativoUserId, setTagCriativoUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/criacao/programacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteRef: cliente.ref,
          clienteNome: cliente.nome,
          nome: nome.trim(),
          formatoPadrao: formato,
          tagCriativoUserId: tagCriativoUserId || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setNome("");
      await onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-slate-200 bg-amber-50/50 px-4 py-3 dark:border-slate-800 dark:bg-amber-950/20">
      <div className="mb-2 text-xs font-bold text-slate-600">Nova programação · {cliente.nome}</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[160px] flex-1 text-sm">
          <span className="mb-1 block text-[10px] font-semibold text-slate-500">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Padrão loja"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <CriativoTagSelect
          value={tagCriativoUserId}
          onChange={setTagCriativoUserId}
          label="Estilo de"
          help="Criativo responsável pelo estilo desta programação."
          className="min-w-[200px] flex-1"
        />
        <label className="text-sm">
          <span className="mb-1 block text-[10px] font-semibold text-slate-500">Formato</span>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {FORMATOS.map((f) => (
              <option key={f} value={f}>
                {FORMATO_LABEL[f as keyof typeof FORMATO_LABEL]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          Criar
        </button>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">
          cancelar
        </button>
      </div>
    </div>
  );
}

function NovaPastaInline({
  programacaoId,
  onDone,
  onEdit,
}: {
  programacaoId: string;
  onDone: () => void | Promise<void>;
  onEdit?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [selecionavel, setSelecionavel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/criacao/programacoes/${programacaoId}/pastas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), selecionavel }),
      });
      setNome("");
      setSelecionavel(false);
      setOpen(false);
      await onEdit?.();
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600"
      >
        + pasta
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="Nome da pasta"
        className="w-28 rounded border border-slate-200 px-2 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
        autoFocus
      />
      <label className="inline-flex items-center gap-0.5 text-[9px] text-violet-700 dark:text-violet-300" title="Só toca no player quando selecionada">
        <input
          type="checkbox"
          checked={selecionavel}
          onChange={(e) => setSelecionavel(e.target.checked)}
          className="h-3 w-3"
        />
        sel.
      </label>
      <button type="button" disabled={busy} onClick={() => void submit()} className="text-[10px] font-bold text-emerald-600">
        ok
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-400">
        ✕
      </button>
    </span>
  );
}

function NovaVinhetaInline({
  programacaoId,
  onDone,
  onEdit,
}: {
  programacaoId: string;
  onDone: () => void | Promise<void>;
  onEdit?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadId = useRef<string | null>(null);

  async function submit() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), tipo: "audio" }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "falha_criar");
      setNome("");
      setOpen(false);
      await onEdit?.();
      await onDone();
      if (data.id) {
        pendingUploadId.current = data.id;
        fileInputRef.current?.click();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pendingUploadId.current;
          pendingUploadId.current = null;
          e.target.value = "";
          if (!file || !id) return;
          void (async () => {
            try {
              await uploadVinhetaAudio(id, file);
              await onEdit?.();
              await onDone();
            } catch (err) {
              const code = err instanceof Error ? err.message : "upload_falhou";
              alert(vinhetaUploadErrorMessage(code));
            }
          })();
        }}
      />
      {!open ?
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600"
        >
          + vinheta
        </button>
      : <span className="inline-flex flex-wrap items-center gap-1">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="Nome da vinheta"
            className="w-28 rounded border border-slate-200 px-2 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
            autoFocus
          />
          <button type="button" disabled={busy} onClick={() => void submit()} className="text-[10px] font-bold text-emerald-600">
            ok
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-400">
            ✕
          </button>
        </span>
      }
    </>
  );
}

type FaixaDiff = { musicaId: string; titulo: string; artista: string; pastaNome: string };

const DISPARO_ERROR: Record<string, string> = {
  nenhum_pdv_amarrado: "Nenhum PDV amarrado a esta programação. Escolha os PDVs na coluna do meio.",
  cliente_gateway_nao_configurado:
    "Cliente ainda sem ID no Player. Configure o login/ID do cliente na produção antes de disparar.",
  cloud2_desabilitado: "Cloud2 desabilitado — publicação indisponível.",
  publicar_falhou: "Falha ao publicar no gateway (cloud2).",
  falha_publicacao: "Erro interno ao gravar a programação no gateway.",
  cliente_gateway_inexistente:
    "Cliente ainda não existe no gateway — sincronize os IDs Player antes de disparar.",
  publicar_timeout: "Publicação demorou demais no cloud2 — tente de novo.",
  sync_registry_falhou: "Falha ao sincronizar PDVs no gateway após publicar.",
  sync_registry_timeout: "Sync no gateway demorou demais — tente de novo.",
  server_error: "Erro interno ao disparar. Veja o log do portal ou tente de novo.",
  disparo_falhou: "Falha ao disparar a atualização.",
};

function FecharAtualizacaoModal({
  programacaoId,
  programacaoNome,
  clienteRef,
  clienteNome,
  onClose,
  onDone,
}: {
  programacaoId: string;
  programacaoNome: string;
  clienteRef: string;
  clienteNome: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [pdvsAmarrados, setPdvsAmarrados] = useState(0);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/criacao/clientes/${encodeURIComponent(clienteRef)}/pdv-programacoes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.pdvs) return;
        const n = (d.pdvs as PdvProgramacaoRow[]).filter((p) => p.programacaoId === programacaoId).length;
        setPdvsAmarrados(n);
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clienteRef, programacaoId]);

  async function disparar() {
    if (busy || pdvsAmarrados === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/disparar-atualizacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        codigo?: string;
        revision?: number;
        diff?: { entraram?: FaixaDiff[]; sairam?: FaixaDiff[] };
        musicas?: number;
        playlists?: number;
        semArquivo?: number;
        clienteGatewayNome?: string;
        pdvsDisparados?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "disparo_falhou");
      const ent = data.diff?.entraram?.length ?? 0;
      const sai = data.diff?.sairam?.length ?? 0;
      setResultado(
        `${data.codigo ?? "Atualização"} — rev. ${data.revision ?? "?"} enviada para ${data.clienteGatewayNome ?? clienteNome}: ` +
          `${data.pdvsDisparados ?? pdvsAmarrados} PDV(s), ${data.playlists ?? 0} pasta(s), ${data.musicas ?? 0} faixa(s). ` +
          `Entraram ${ent}, saíram ${sai}.` +
          (data.semArquivo ? ` (${data.semArquivo} sem áudio)` : ""),
      );
      await onDone();
    } catch (e) {
      const code = e instanceof Error ? e.message : "disparo_falhou";
      setError(
        DISPARO_ERROR[code] ??
          (code.startsWith("sync_registry") ? DISPARO_ERROR.sync_registry_falhou
          : code.startsWith("falha_publicacao") || code.startsWith("publicar_falhou") ?
            (code.includes(":") ? code.replace(/^[^:]+:\s*/, "Erro ao publicar: ") : DISPARO_ERROR.falha_publicacao)
          : code),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold">Fechar atualização</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{programacaoNome}</p>
          <p className="mb-1 text-[10px] text-slate-500">Cliente: {clienteNome}</p>
          <p className="mb-3 text-xs text-slate-500">
            Envia ao Player 5 o estado atual desta programação nos PDVs amarrados e encerra o ciclo de edição. O log
            registra o que entrou e saiu desde o último fechamento.
          </p>
          {loadingInfo ?
            <div className="mb-3 py-2 text-center text-sm text-slate-400">Verificando PDVs amarrados…</div>
          : pdvsAmarrados === 0 ?
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Nenhum PDV amarrado a esta programação. Volte à coluna <strong>PDVs</strong> e escolha as lojas antes
              de fechar.
            </div>
          : <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
              {pdvsAmarrados} PDV{pdvsAmarrados === 1 ? "" : "s"} receberão esta atualização ao fechar.
            </div>
          }
          {error ?
            <div className="mb-2 text-sm text-red-600">{error}</div>
          : null}
          {resultado ?
            <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              {resultado}
            </div>
          : null}
          <button
            type="button"
            onClick={() => void disparar()}
            disabled={busy || loadingInfo || pdvsAmarrados === 0 || !!resultado}
            className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? "Fechando…" : "Fechar agora"}
          </button>
        </div>
      </div>
    </div>
  );
}

type AtualizacaoLogItem = {
  id: string;
  codigo: string;
  revision: number;
  disparadaEm: string;
  disparadaPor: string;
  diff: { entraram: FaixaDiff[]; sairam: FaixaDiff[] };
  musicasPublicadas: number;
  playlistsPublicadas: number;
};

function AtualizacaoLogPanel({ programacaoId }: { programacaoId: string }) {
  const [rows, setRows] = useState<AtualizacaoLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/criacao/programacoes/${programacaoId}/atualizacoes`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { atualizacoes?: AtualizacaoLogItem[] };
      setRows(data.atualizacoes ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [programacaoId]);

  useEffect(() => {
    void load();
  }, [load]);

  function fmtData(iso: string) {
    try {
      return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch {
      return iso;
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (loading) {
    return <p className="mt-2 text-[10px] text-slate-400">Carregando log…</p>;
  }

  if (rows.length === 0) {
    return <p className="mt-2 text-[10px] text-slate-400">Nenhuma atualização disparada ainda.</p>;
  }

  return (
    <ul className="mt-2 space-y-1 rounded border border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/50">
      {rows.map((r) => {
        const aberto = expanded.has(r.id);
        const ent = r.diff?.entraram ?? [];
        const sai = r.diff?.sairam ?? [];
        return (
          <li key={r.id} className="text-[10px]">
            <button
              type="button"
              onClick={() => toggle(r.id)}
              className="flex w-full items-center gap-2 text-left font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300"
            >
              <span>{aberto ? "▾" : "▸"}</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">{r.codigo}</span>
              <span className="font-normal text-slate-400">· rev. {r.revision}</span>
              <span className="ml-auto font-normal text-slate-400">{fmtData(r.disparadaEm)}</span>
            </button>
            <p className="ml-4 text-slate-500">
              {r.disparadaPor} · +{ent.length} / −{sai.length} · {r.playlistsPublicadas} pasta(s), {r.musicasPublicadas}{" "}
              faixa(s)
            </p>
            {aberto ?
              <div className="ml-4 mt-1 grid gap-2 sm:grid-cols-2">
                <DiffList titulo="Entraram" faixas={ent} cor="emerald" />
                <DiffList titulo="Saíram" faixas={sai} cor="red" />
              </div>
            : null}
          </li>
        );
      })}
    </ul>
  );
}

function DiffList({
  titulo,
  faixas,
  cor,
}: {
  titulo: string;
  faixas: FaixaDiff[];
  cor: "emerald" | "red";
}) {
  const border = cor === "emerald" ? "border-emerald-200 dark:border-emerald-900" : "border-red-200 dark:border-red-900";
  const head = cor === "emerald" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
  if (faixas.length === 0) {
    return (
      <div className={`rounded border ${border} p-2`}>
        <p className={`font-semibold ${head}`}>{titulo}</p>
        <p className="text-slate-400">—</p>
      </div>
    );
  }
  return (
    <div className={`rounded border ${border} p-2`}>
      <p className={`mb-1 font-semibold ${head}`}>
        {titulo} ({faixas.length})
      </p>
      <ul className="max-h-32 space-y-0.5 overflow-y-auto text-slate-600 dark:text-slate-400">
        {faixas.map((f) => (
          <li key={f.musicaId}>
            <span className="text-slate-400">[{f.pastaNome}]</span> {f.titulo}
            {f.artista ? ` — ${f.artista}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
