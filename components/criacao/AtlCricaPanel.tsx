"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { MusicaPreviewButton } from "@/components/criacao/MusicaPreviewDock";
import { competenciaLabel } from "@/lib/criacao/competencia";
import type { AtlCricaBoardPayload, AtlCricaClienteGroup } from "@/lib/criacao/atlCricaService";
import type { AtlCricaInteligenteResult, AtlCricaSugestaoPasta } from "@/lib/criacao/atlCricaInteligenteService";
import {
  abrirProgramacoesAtlCrica,
  addBibliotecaMusicasToPastas,
  marcarSubidoAtlCrica,
  submitAtlCricaFileUpload,
} from "@/lib/criacao/atlCricaUploadClient";
import { AtlCricaImportExportSection } from "@/components/criacao/AtlCricaImportExportSection";
import { useProgramacaoDonoMap } from "@/lib/criacao/useProgramacaoDonoMap";
import type { ArvoreProgramacaoNode } from "@/lib/criacao/programacaoService";

type ModoAtualizacao = "upload" | "inteligente" | "spotify";

type BibRow = {
  id: string;
  titulo: string;
  artista: string;
  previewUrl: string | null;
};

type PastaUploadDraft = {
  pastaId: string;
  pastaNome: string;
  programacaoId: string;
  programacaoNome: string;
  arquivos: File[];
  bibliotecaIds: string[];
  bibliotecaLabels: string[];
};

function StatusPills({ c }: { c: AtlCricaClienteGroup }) {
  return (
    <div className="flex flex-wrap gap-1 text-[10px]">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
        {c.totalProgramacoes} prog.
      </span>
      {c.pendentes > 0 ?
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {c.pendentes} pendente{c.pendentes === 1 ? "" : "s"}
        </span>
      : null}
      {c.subidas > 0 ?
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100">
          {c.subidas} na fila
        </span>
      : null}
      {c.entregues > 0 ?
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          {c.entregues} subido{c.entregues === 1 ? "" : "s"}
        </span>
      : null}
      {c.fechadas > 0 ?
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-900 dark:bg-violet-950 dark:text-violet-100">
          {c.fechadas} fechada{c.fechadas === 1 ? "" : "s"}
        </span>
      : null}
    </div>
  );
}

export function AtlCricaPanel() {
  const { map: donoMap } = useProgramacaoDonoMap();
  const [competencia, setCompetencia] = useState("");
  const [board, setBoard] = useState<AtlCricaBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [clienteAtivo, setClienteAtivo] = useState<AtlCricaClienteGroup | null>(null);
  const [modo, setModo] = useState<ModoAtualizacao>("upload");
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null);

  const load = useCallback(async (comp?: string) => {
    setLoading(true);
    setMsg("");
    try {
      const q = comp ? `?competencia=${encodeURIComponent(comp)}` : "";
      const res = await fetch(`/api/criacao/atl-crica${q}`);
      const data = (await res.json()) as AtlCricaBoardPayload & { error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setBoard(data);
      setCompetencia(data.competencia);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar ATL CRICA.");
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clientesVisiveis = useMemo(() => {
    if (!board) return [];
    const email = board.sessionEmail.toLowerCase();
    if (board.isAdmin) return board.clientes;
    return board.clientes.filter((c) =>
      c.programacoes.some((p) => {
        const dono = donoMap[p.programacaoId];
        if (dono?.criativoEmail.toLowerCase() === email) return true;
        return (p.criativoUserId ?? "").toLowerCase() === email;
      }),
    );
  }, [board, donoMap]);

  const skeletonWarnings = useMemo(() => {
    if (!board) return [];
    return board.rows
      .filter((p) => p.pastasCount === 0)
      .map((p) => `${p.clienteNome} · ${p.programacaoNome} — sem pastas na Central de programações.`);
  }, [board]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4 dark:border-violet-900/40 dark:from-violet-950/30 dark:to-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          ATL CRICA
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Exporte a hierarquia de pastas no Mac, arraste os MP3s do mês e importe de volta — o portal envia cada faixa
          para a pasta certa. Conectado ao painel de{" "}
          <Link href="/criacao/atualizacoes" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            PRODUÇÃO
          </Link>{" "}
          e à{" "}
          <Link href="/criacao/programacoes" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            Central de programações
          </Link>
          .
        </p>
      </section>

      {board?.migrationPendente ?
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40">
          Migration do painel ATL pendente no banco — peça deploy com{" "}
          <code className="text-xs">prisma migrate deploy</code>.
        </p>
      : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Competência:</span>
        {(board?.competencias ?? []).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => void load(c)}
            className={
              "rounded-full px-3 py-1 text-xs font-semibold transition " +
              (competencia === c ?
                "bg-violet-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200")
            }
          >
            {competenciaLabel(c)}
            {c === board?.competenciaAtual ? " · atual" : ""}
          </button>
        ))}
      </div>

      {msg ?
        <p className="text-sm text-rose-600 dark:text-rose-400">{msg}</p>
      : null}

      {skeletonWarnings.length > 0 ?
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">Esqueleto incompleto — corrija antes de exportar:</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {skeletonWarnings.slice(0, 8).map((w) => (
              <li key={w}>{w}</li>
            ))}
            {skeletonWarnings.length > 8 ?
              <li>… e mais {skeletonWarnings.length - 8}</li>
            : null}
          </ul>
        </div>
      : null}

      {competencia ?
        <AtlCricaImportExportSection
          competencia={competencia}
          onDone={() => void load(competencia)}
        />
      : null}

      {loading ?
        <p className="text-sm text-slate-500">Carregando…</p>
      : clientesVisiveis.length === 0 ?
        <p className="text-sm text-slate-500">
          Nenhum cliente seu nesta competência. Defina o <strong>Dono</strong> em Programações ou crie programações
          com seu usuário.
        </p>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Programações</th>
                <th className="px-3 py-2">Status do mês</th>
              </tr>
            </thead>
            <tbody>
              {clientesVisiveis.map((c) => (
                <Fragment key={c.clienteRef}>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="font-semibold hover:text-violet-700 dark:hover:text-violet-300"
                        onClick={() =>
                          setExpandedCliente((prev) => (prev === c.clienteRef ? null : c.clienteRef))
                        }
                      >
                        {expandedCliente === c.clienteRef ? "▾" : "▸"} {c.clienteNome}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{c.totalProgramacoes}</td>
                    <td className="px-3 py-2.5">
                      <StatusPills c={c} />
                    </td>
                  </tr>
                  {expandedCliente === c.clienteRef ?
                    <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
                      <td colSpan={3} className="px-3 py-2">
                        <ul className="space-y-1 text-xs">
                          {c.programacoes.map((p) => (
                            <li key={p.programacaoId} className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{p.programacaoNome}</span>
                              <span className="text-slate-500">{p.pastasCount} pastas</span>
                              {p.criativoEntregue ?
                                <span className="rounded bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                  ✓ subido
                                </span>
                              : p.subidaFila ?
                                <span className="rounded bg-sky-100 px-1.5 text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                                  na fila
                                </span>
                              : <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                  pendente
                                </span>
                              }
                              {p.atualizacaoAberta ?
                                <span className="rounded bg-orange-100 px-1.5 text-orange-800 dark:bg-orange-950 dark:text-orange-200">
                                  aberta
                                </span>
                              : null}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      }

      {clientesVisiveis.length > 0 ?
        <details className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">
            Fluxo antigo no portal (upload por cliente, inteligente, Spotify)
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Use apenas se não puder trabalhar com pastas locais. Prefira exportar/importar acima.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {clientesVisiveis.map((c) => (
              <button
                key={c.clienteRef}
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
                onClick={() => {
                  setClienteAtivo(c);
                  setModo("upload");
                }}
              >
                {c.clienteNome} →
              </button>
            ))}
          </div>
        </details>
      : null}

      {clienteAtivo ?
        <ClienteWorkspace
          cliente={clienteAtivo}
          competencia={competencia}
          modo={modo}
          onModo={setModo}
          onClose={() => setClienteAtivo(null)}
          onDone={() => {
            setClienteAtivo(null);
            void load(competencia);
          }}
        />
      : null}
    </div>
  );
}

function ClienteWorkspace({
  cliente,
  competencia,
  modo,
  onModo,
  onClose,
  onDone,
}: {
  cliente: AtlCricaClienteGroup;
  competencia: string;
  modo: ModoAtualizacao;
  onModo: (m: ModoAtualizacao) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-2 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">ATL CRICA</p>
            <h2 className="text-lg font-bold">{cliente.clienteNome}</h2>
            <p className="text-xs text-slate-500">
              {competenciaLabel(competencia)} · {cliente.totalProgramacoes} programações
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            ✕
          </button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          {(
            [
              { id: "upload" as const, label: "1 · Upload pasta" },
              { id: "inteligente" as const, label: "2 · Inteligente" },
              { id: "spotify" as const, label: "3 · Link Spotify" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onModo(tab.id)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold " +
                (modo === tab.id ?
                  "bg-violet-600 text-white"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {modo === "upload" ?
            <UploadModo cliente={cliente} competencia={competencia} onDone={onDone} />
          : modo === "inteligente" ?
            <InteligenteModo cliente={cliente} competencia={competencia} onDone={onDone} />
          : <PlaceholderModo titulo="Link Spotify" texto="Download direto de playlist Spotify — aguardando fechamento do módulo de streamings." />}
        </div>
      </div>
    </div>
  );
}

function PlaceholderModo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-600 dark:bg-slate-800/50">
      <p className="font-semibold text-slate-800 dark:text-slate-100">{titulo}</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{texto}</p>
    </div>
  );
}

function UploadModo({
  cliente,
  competencia,
  onDone,
}: {
  cliente: AtlCricaClienteGroup;
  competencia: string;
  onDone: () => void;
}) {
  const [arvore, setArvore] = useState<ArvoreProgramacaoNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; label?: string } | null>(null);
  const [drafts, setDrafts] = useState<PastaUploadDraft[]>([]);
  const [pastaSel, setPastaSel] = useState<{ programacaoId: string; pastaId: string } | null>(null);
  const [bibPicker, setBibPicker] = useState<{ programacaoId: string; pastaId: string; pastaNome: string; programacaoNome: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/criacao/clientes/${encodeURIComponent(cliente.clienteRef)}/arvore`);
        const data = (await res.json()) as { arvore?: ArvoreProgramacaoNode[] };
        if (!cancelled) setArvore(data.arvore ?? []);
      } catch {
        if (!cancelled) setArvore([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cliente.clienteRef]);

  const progById = useMemo(() => new Map(cliente.programacoes.map((p) => [p.programacaoId, p])), [cliente.programacoes]);
  const arvoreFiltrada = useMemo(
    () => arvore.filter((p) => progById.has(p.id)),
    [arvore, progById],
  );

  function upsertDraft(patch: Partial<PastaUploadDraft> & { pastaId: string }) {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.pastaId === patch.pastaId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx]!, ...patch };
        return next;
      }
      return [...prev, patch as PastaUploadDraft];
    });
  }

  function addFiles(files: FileList | null) {
    if (!pastaSel || !files?.length) return;
    const prog = arvoreFiltrada.find((p) => p.id === pastaSel.programacaoId);
    const pasta = prog?.pastas.find((x) => x.id === pastaSel.pastaId);
    if (!pasta || !prog) return;
    const mp3s = [...files].filter((f) => f.name.toLowerCase().endsWith(".mp3"));
    if (mp3s.length === 0) {
      setMsg("Selecione arquivos .mp3");
      return;
    }
    const existing = drafts.find((d) => d.pastaId === pasta.id);
    upsertDraft({
      pastaId: pasta.id,
      pastaNome: pasta.nome,
      programacaoId: prog.id,
      programacaoNome: prog.nome,
      arquivos: [...(existing?.arquivos ?? []), ...mp3s],
      bibliotecaIds: existing?.bibliotecaIds ?? [],
      bibliotecaLabels: existing?.bibliotecaLabels ?? [],
    });
    setMsg("");
  }

  function addBiblioteca(musicaIds: string[], labels: string[]) {
    if (!bibPicker || musicaIds.length === 0) return;
    const existing = drafts.find((d) => d.pastaId === bibPicker.pastaId);
    upsertDraft({
      pastaId: bibPicker.pastaId,
      pastaNome: bibPicker.pastaNome,
      programacaoId: bibPicker.programacaoId,
      programacaoNome: bibPicker.programacaoNome,
      arquivos: existing?.arquivos ?? [],
      bibliotecaIds: [...new Set([...(existing?.bibliotecaIds ?? []), ...musicaIds])],
      bibliotecaLabels: [...(existing?.bibliotecaLabels ?? []), ...labels],
    });
    setBibPicker(null);
  }

  async function enviar() {
    if (drafts.length === 0) {
      setMsg("Adicione músicas em pelo menos uma pasta.");
      return;
    }
    setBusy(true);
    setMsg("");
    setProgress(null);
    try {
      const progIds = [...new Set(drafts.map((d) => d.programacaoId))];
      await abrirProgramacoesAtlCrica(progIds);

      const fileLotes = drafts
        .filter((d) => d.arquivos.length > 0)
        .map((d) => ({
          programacaoId: d.programacaoId,
          pastaId: d.pastaId,
          pastaNome: d.pastaNome,
          programacaoNome: d.programacaoNome,
          arquivos: d.arquivos,
        }));

      if (fileLotes.length > 0) {
        setProgress({ done: 0, total: fileLotes.reduce((n, l) => n + l.arquivos.length, 0) });
        const up = await submitAtlCricaFileUpload({
          titulo: `ATL CRICA ${cliente.clienteNome}`,
          competencia,
          clienteRef: cliente.clienteRef,
          clienteNome: cliente.clienteNome,
          lotes: fileLotes,
          onProgress: (done, total, label) => setProgress({ done, total, label }),
        });
        if (!up.ok) {
          setMsg(up.error);
          return;
        }
      }

      await addBibliotecaMusicasToPastas(
        drafts
          .filter((d) => d.bibliotecaIds.length > 0)
          .map((d) => ({ pastaId: d.pastaId, musicaIds: d.bibliotecaIds })),
      );

      await marcarSubidoAtlCrica(progIds, competencia);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando pastas…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Selecione pastas, adicione MP3 do computador ou da biblioteca (várias pastas no mesmo envio). Ao confirmar,
        entra na fila com tags, marca subido no ATL CRICA e no painel de produção.
      </p>

      {msg ?
        <p className="text-sm text-rose-600">{msg}</p>
      : null}
      {progress ?
        <p className="text-sm text-slate-600">
          Enviando {progress.done}/{progress.total}
          {progress.label ? ` · ${progress.label}` : ""}…
        </p>
      : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">Pastas</p>
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {arvoreFiltrada.map((prog) => {
              const painel = progById.get(prog.id);
              return (
                <div key={prog.id}>
                  <p className="text-sm font-semibold">
                    {prog.nome}
                    {painel?.criativoEntregue ?
                      <span className="ms-2 text-[10px] font-normal text-emerald-600">✓ subido</span>
                    : painel?.subidaFila ?
                      <span className="ms-2 text-[10px] font-normal text-sky-600">fila</span>
                    : null}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {prog.pastas.map((pasta) => (
                      <li key={pasta.id} className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPastaSel({ programacaoId: prog.id, pastaId: pasta.id })}
                          className={
                            "flex-1 rounded-lg border px-2 py-1.5 text-left text-xs " +
                            (pastaSel?.pastaId === pasta.id ?
                              "border-violet-400 bg-violet-50 dark:border-violet-600 dark:bg-violet-950/40"
                            : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")
                          }
                        >
                          {pasta.nome}
                          <span className="ms-1 text-slate-400">({pasta.musicasCount} faixas)</span>
                        </button>
                        <button
                          type="button"
                          disabled={!pastaSel || pastaSel.pastaId !== pasta.id}
                          onClick={() =>
                            setBibPicker({
                              programacaoId: prog.id,
                              pastaId: pasta.id,
                              pastaNome: pasta.nome,
                              programacaoNome: prog.nome,
                            })
                          }
                          className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold disabled:opacity-40 dark:border-slate-700"
                        >
                          Biblioteca
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <label className="mt-3 block">
            <span className="text-xs font-semibold text-slate-600">MP3 para pasta selecionada</span>
            <input
              type="file"
              accept="audio/mpeg,.mp3"
              multiple
              disabled={!pastaSel}
              className="mt-1 block w-full text-xs"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">Lote deste envio</p>
          {drafts.length === 0 ?
            <p className="text-sm text-slate-500">Nenhuma pasta no lote ainda.</p>
          : <ul className="space-y-2">
              {drafts.map((d) => (
                <li key={d.pastaId} className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-800">
                  <span className="font-semibold">{d.programacaoNome}</span> → {d.pastaNome}:{" "}
                  {d.arquivos.length} MP3
                  {d.bibliotecaIds.length > 0 ?
                    <span> · {d.bibliotecaIds.length} da biblioteca</span>
                  : null}
                </li>
              ))}
            </ul>
          }
          <button
            type="button"
            disabled={busy || drafts.length === 0}
            onClick={() => void enviar()}
            className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Enviando…" : "OK — fila + marcar subido"}
          </button>
        </div>
      </div>

      {bibPicker ?
        <BibliotecaPickerModal
          pastaNome={bibPicker.pastaNome}
          onClose={() => setBibPicker(null)}
          onConfirm={(ids, labels) => addBiblioteca(ids, labels)}
        />
      : null}
    </div>
  );
}

function BibliotecaPickerModal({
  pastaNome,
  onClose,
  onConfirm,
}: {
  pastaNome: string;
  onClose: () => void;
  onConfirm: (ids: string[], labels: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<BibRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "80", status: "pronta" });
      if (busca.trim()) params.set("search", busca.trim());
      const res = await fetch(`/api/criacao/biblioteca?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { musicas: BibRow[] };
      setRows(data.musicas);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-bold">Biblioteca → {pastaNome}</h3>
        </div>
        <div className="flex gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button type="button" onClick={() => void load()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            Buscar
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {loading ?
            <li className="px-4 py-6 text-sm text-slate-500">Carregando…</li>
          : rows.length === 0 ?
            <li className="px-4 py-6 text-sm text-slate-500">Nenhuma faixa.</li>
          : rows.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.titulo}</div>
                  <div className="truncate text-xs text-slate-500">{m.artista}</div>
                </div>
                {m.previewUrl ?
                  <MusicaPreviewButton
                    track={{ id: m.id, titulo: m.titulo, artista: m.artista, previewUrl: m.previewUrl, durationMs: null }}
                  />
                : null}
              </li>
            ))
          }
        </ul>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600">
            Cancelar
          </button>
          <button
            type="button"
            disabled={sel.size === 0}
            onClick={() => {
              const ids = [...sel];
              const labels = ids.map((id) => {
                const r = rows.find((x) => x.id === id);
                return r ? `${r.artista} — ${r.titulo}` : id;
              });
              onConfirm(ids, labels);
            }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Adicionar {sel.size > 0 ? sel.size : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function InteligenteModo({
  cliente,
  competencia,
  onDone,
}: {
  cliente: AtlCricaClienteGroup;
  competencia: string;
  onDone: () => void;
}) {
  const [progSel, setProgSel] = useState(cliente.programacoes[0]?.programacaoId ?? "");
  const [result, setResult] = useState<AtlCricaInteligenteResult | null>(null);
  const [rejeitadas, setRejeitadas] = useState<Set<string>>(new Set());
  const [aprovadas, setAprovadas] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(
    async (extraExclude?: string[]) => {
      if (!progSel) return;
      setLoading(true);
      setMsg("");
      try {
        const exclude = [...new Set([...rejeitadas, ...(extraExclude ?? [])])];
        const res = await fetch("/api/criacao/atl-crica/inteligente/sugerir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programacaoId: progSel, excludeMusicaIds: exclude }),
        });
        const data = (await res.json()) as AtlCricaInteligenteResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "erro");
        setResult(data);
        const next = new Map<string, Set<string>>();
        for (const p of data.pastas) {
          next.set(p.pastaId, new Set(p.faixas.map((f) => f.id)));
        }
        setAprovadas(next);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro ao gerar sugestões.");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [progSel, rejeitadas],
  );

  useEffect(() => {
    if (progSel) void carregar();
  }, [progSel]); // eslint-disable-line react-hooks/exhaustive-deps -- recarrega ao trocar prog

  function toggleFaixa(pastaId: string, musicaId: string) {
    setAprovadas((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(pastaId) ?? []);
      if (set.has(musicaId)) set.delete(musicaId);
      else set.add(musicaId);
      next.set(pastaId, set);
      return next;
    });
  }

  function pedirMais(faixaId: string) {
    setRejeitadas((prev) => new Set(prev).add(faixaId));
    void carregar([faixaId]);
  }

  async function aprovar() {
    const aprovacoes = [...aprovadas.entries()]
      .map(([pastaId, set]) => ({ pastaId, musicaIds: [...set] }))
      .filter((a) => a.musicaIds.length > 0);
    if (aprovacoes.length === 0) {
      setMsg("Selecione ao menos uma faixa.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/criacao/atl-crica/inteligente/aprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programacaoId: progSel, competencia, aprovacoes }),
      });
      const data = (await res.json()) as { error?: string; added?: number };
      if (!res.ok) throw new Error(data.error ?? "erro");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao aprovar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        IA sugere ~10–20% de acréscimo por pasta, priorizando a tag do dono (nome da pasta) e faixas pouco usadas no
        histórico do cliente.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-slate-500">Programação:</label>
        <select
          value={progSel}
          onChange={(e) => {
            setProgSel(e.target.value);
            setResult(null);
            setRejeitadas(new Set());
          }}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {cliente.programacoes.map((p) => (
            <option key={p.programacaoId} value={p.programacaoId}>
              {p.programacaoNome}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={loading || !progSel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
        >
          {loading ? "Gerando…" : "Mais indicações"}
        </button>
      </div>

      {msg ?
        <p className="text-sm text-rose-600">{msg}</p>
      : null}
      {result?.avisos.map((a) => (
        <p key={a} className="text-xs text-amber-700 dark:text-amber-300">
          {a}
        </p>
      ))}

      {loading && !result ?
        <p className="text-sm text-slate-500">Analisando pastas e tags…</p>
      : result ?
        <div className="space-y-3">
          {result.pastas.map((pasta) => (
            <SugestaoPastaCard
              key={pasta.pastaId}
              pasta={pasta}
              aprovadas={aprovadas.get(pasta.pastaId) ?? new Set()}
              onToggle={(id) => toggleFaixa(pasta.pastaId, id)}
              onPedirMais={pedirMais}
            />
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void aprovar()}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Aplicando…" : "Aprovar seleção e marcar subido"}
          </button>
        </div>
      : null}
    </div>
  );
}

function SugestaoPastaCard({
  pasta,
  aprovadas,
  onToggle,
  onPedirMais,
}: {
  pasta: AtlCricaSugestaoPasta;
  aprovadas: Set<string>;
  onToggle: (id: string) => void;
  onPedirMais: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{pasta.pastaNome}</p>
        <p className="text-[10px] text-slate-500">
          {pasta.atualCount} faixas · +{pasta.alvoAcrescimo} sugeridas
          {pasta.tagNome ? ` · tag ${pasta.tagNome}` : ""}
        </p>
      </div>
      {pasta.faixas.length === 0 ?
        <p className="mt-2 text-xs text-slate-500">Sem sugestões.</p>
      : <ul className="mt-2 space-y-1">
          {pasta.faixas.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-800">
              <input type="checkbox" checked={aprovadas.has(f.id)} onChange={() => onToggle(f.id)} />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{f.titulo}</span>
                <span className="text-slate-500"> · {f.artista}</span>
                <span className="ms-1 text-[10px] text-slate-400">({f.motivo})</span>
              </div>
              {f.previewUrl ?
                <MusicaPreviewButton
                  track={{ id: f.id, titulo: f.titulo, artista: f.artista, previewUrl: f.previewUrl, durationMs: null }}
                />
              : null}
              <button type="button" onClick={() => onPedirMais(f.id)} className="text-[10px] text-violet-600 hover:underline">
                outra
              </button>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
