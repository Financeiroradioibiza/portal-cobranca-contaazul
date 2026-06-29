"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChamadoPrioridade } from "@prisma/client";
import { CHAMADO_COLUNAS, CHAMADO_PRIORIDADES, prioridadeMeta } from "@/lib/chamados/chamadoConstants";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import type {
  ClienteAtualizacaoItem,
  ClienteDetailPayload,
  ClienteFeedbackItem,
  ClienteInstalacaoItem,
  ClienteResumo,
} from "@/lib/clientes/clientesRelacionamentoService";
import { RioTagCobrancaNome } from "@/components/rio/RioTagCobrancaNome";
import { ProducaoClienteDrawer } from "@/components/producao/ProducaoClienteDrawer";

const MIN_SEARCH_LEN = 2;

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
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

type ChamadoTarget =
  | { kind: "cliente"; rioLinhaId: string; clienteNome: string }
  | { kind: "pdv"; rioLinhaId: string; rioPdvKey: string; clienteNome: string; pdvNome: string };

export function ClientesRelacionamentoPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("key");

  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(false);
  const [list, setList] = useState<ClienteResumo[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [preview, setPreview] = useState<ClienteResumo | null>(null);
  const [detail, setDetail] = useState<ClienteDetailPayload | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chamadoTarget, setChamadoTarget] = useState<ChamadoTarget | null>(null);

  const loadList = useCallback(async (needle: string) => {
    const term = needle.trim();
    if (term.length < MIN_SEARCH_LEN) {
      setList([]);
      setSearched(false);
      return;
    }
    setListBusy(true);
    setMsg("");
    setPreview(null);
    try {
      const res = await fetch(`/api/clientes?q=${encodeURIComponent(term)}`);
      const json = (await res.json()) as { ok?: boolean; clientes?: ClienteResumo[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setList(json.clientes ?? []);
      setSearched(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao buscar clientes.");
      setList([]);
      setSearched(true);
    } finally {
      setListBusy(false);
    }
  }, []);

  const loadDetail = useCallback(async (key: string) => {
    setDetailBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(key)}`);
      const json = (await res.json()) as ClienteDetailPayload & { error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "erro");
      setDetail(json);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar cliente.");
      setDetail(null);
    } finally {
      setDetailBusy(false);
    }
  }, []);

  useEffect(() => {
    if (selectedKey) {
      void loadDetail(selectedKey);
    } else {
      setDetail(null);
    }
  }, [selectedKey, loadDetail]);

  function runSearch(e?: FormEvent) {
    e?.preventDefault();
    void loadList(q);
  }

  function openCliente(key: string) {
    router.push(`/clientes?key=${encodeURIComponent(key)}`);
  }

  function backToSearch() {
    router.push("/clientes");
    setPreview(null);
  }

  if (selectedKey) {
    return (
      <div className="space-y-4">
        {msg ?
          <p className="text-sm text-rose-600 dark:text-rose-400">{msg}</p>
        : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={backToSearch}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← Voltar à busca
          </button>
          {detail ?
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-fuchsia-300 px-3 py-1.5 text-sm font-semibold text-fuchsia-800 dark:border-fuchsia-700 dark:text-fuchsia-200"
            >
              Dados cadastrais
            </button>
          : null}
        </div>

        {detailBusy && !detail ?
          <p className="text-sm text-slate-500">Carregando cliente…</p>
        : detail ?
          <ClienteDetailView
            data={detail}
            onOpenChamadoCliente={() =>
              setChamadoTarget({
                kind: "cliente",
                rioLinhaId: detail.cliente.rioLinhaId,
                clienteNome: detail.cliente.nome,
              })
            }
            onOpenChamadoPdv={(pdv) =>
              setChamadoTarget({
                kind: "pdv",
                rioLinhaId: detail.cliente.rioLinhaId,
                rioPdvKey: pdv.rioPdvKey,
                clienteNome: detail.cliente.nome,
                pdvNome: pdv.pdvNome,
              })
            }
            onReload={() => void loadDetail(selectedKey)}
          />
        : null}

        <ProducaoClienteDrawer detail={drawerOpen ? detail?.detail ?? null : null} onClose={() => setDrawerOpen(false)} />

        {chamadoTarget ?
          <NovoChamadoModal
            target={chamadoTarget}
            onClose={() => setChamadoTarget(null)}
            onCreated={() => {
              setChamadoTarget(null);
              void loadDetail(selectedKey);
            }}
          />
        : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Buscar cliente</p>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Digite pelo menos {MIN_SEARCH_LEN} caracteres e busque. Escolha o cliente na lista e confirme para abrir a ficha.
        </p>
        <form onSubmit={runSearch} className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome do cliente ou PDV…"
            className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            autoFocus
          />
          <button
            type="submit"
            disabled={listBusy || q.trim().length < MIN_SEARCH_LEN}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {listBusy ? "Buscando…" : "Buscar"}
          </button>
        </form>
      </section>

      {msg ?
        <p className="text-sm text-rose-600 dark:text-rose-400">{msg}</p>
      : null}

      {preview ?
        <section className="rounded-xl border-2 border-fuchsia-300 bg-fuchsia-50/60 p-4 dark:border-fuchsia-800 dark:bg-fuchsia-950/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
            Cliente selecionado
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <RioTagCobrancaNome
                nome={preview.nome}
                tag={preview.tagCobranca}
                className="text-lg font-bold text-slate-900 dark:text-white"
              />
              {preview.isCustom ?
                <span className="ms-1 text-xs text-violet-600">· grupo manual</span>
              : null}
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-400">
                <span>{preview.pdvCount} PDVs</span>
                <span className="text-emerald-600">{preview.onlineCount} tocando</span>
                {preview.offlineCount > 0 ?
                  <span className="text-amber-600">{preview.offlineCount} offline</span>
                : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-900"
              >
                Trocar
              </button>
              <button
                type="button"
                onClick={() => openCliente(preview.key)}
                className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500"
              >
                Continuar →
              </button>
            </div>
          </div>
        </section>
      : null}

      {listBusy ?
        <p className="text-sm text-slate-500">Buscando clientes…</p>
      : searched && list.length === 0 ?
        <p className="text-sm text-slate-500">Nenhum cliente encontrado para &quot;{q.trim()}&quot;.</p>
      : list.length > 0 ?
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setPreview(c)}
              className={
                "rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md dark:bg-slate-900 " +
                (preview?.key === c.key ?
                  "border-fuchsia-400 ring-2 ring-fuchsia-200 dark:border-fuchsia-600 dark:ring-fuchsia-900"
                : "border-slate-200 hover:border-fuchsia-300 dark:border-slate-700 dark:hover:border-fuchsia-700")
              }
            >
              <RioTagCobrancaNome nome={c.nome} tag={c.tagCobranca} className="font-bold text-slate-900 dark:text-white" />
              {c.isCustom ?
                <span className="ms-1 text-[10px] font-normal text-violet-600">· manual</span>
              : null}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span>{c.pdvCount} PDVs</span>
                <span className="text-emerald-600">{c.onlineCount} tocando</span>
                {c.offlineCount > 0 ?
                  <span className="text-amber-600">{c.offlineCount} offline</span>
                : null}
              </div>
            </button>
          ))}
        </div>
      : null}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "orange" | "slate" }) {
  const tones = {
    green: "text-emerald-600",
    orange: "text-amber-600",
    slate: "text-slate-900 dark:text-white",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={"text-2xl font-bold " + (tones[tone ?? "slate"])}>{value}</p>
    </div>
  );
}

function ClienteDetailView({
  data,
  onOpenChamadoCliente,
  onOpenChamadoPdv,
  onReload,
}: {
  data: ClienteDetailPayload;
  onOpenChamadoCliente: () => void;
  onOpenChamadoPdv: (pdv: ClienteInstalacaoItem) => void;
  onReload: () => void;
}) {
  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-white p-4 dark:border-fuchsia-900/40 dark:from-fuchsia-950/30 dark:to-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">Cliente</p>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          <RioTagCobrancaNome nome={data.cliente.nome} tag={data.cliente.tagCobranca} />
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatBox label="PDVs" value={data.pdvCount} />
          <StatBox label="PDVs tocando" value={data.pdvsTocando} tone="green" />
          <StatBox label="Chamados" value={data.chamados.length} tone="orange" />
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={onOpenChamadoCliente}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            + Abrir chamado do cliente
          </button>
        </div>
      </header>

      <Section title="Chamados relacionados" count={data.chamados.length}>
        {data.chamados.length === 0 ?
          <p className="text-sm text-slate-500">Nenhum chamado vinculado a este cliente ainda.</p>
        : <ul className="space-y-2">
            {data.chamados.map((c) => (
              <ChamadoRow key={c.id} chamado={c} />
            ))}
          </ul>
        }
      </Section>

      <Section title="PDVs e instalações" count={data.instalacoes.length}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700">
                <th className="py-2 pe-3">PDV</th>
                <th className="py-2 pe-3">Programação</th>
                <th className="py-2 pe-3">Status</th>
                <th className="py-2 pe-3">Instalado</th>
                <th className="py-2 pe-3">Último ping</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.instalacoes.map((p) => (
                <tr key={p.rioPdvKey} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pe-3 font-semibold">{p.pdvNome}</td>
                  <td className="py-2 pe-3 text-slate-600 dark:text-slate-400">{p.programacaoMusical}</td>
                  <td className="py-2 pe-3">
                    {p.tocando ?
                      <span className="text-emerald-600">● Tocando</span>
                    : <span className="text-slate-400">Parado</span>}
                  </td>
                  <td className="py-2 pe-3 text-slate-500">{fmtWhen(p.instaladoEm)}</td>
                  <td className="py-2 pe-3 text-slate-500">{fmtWhen(p.ultimoPingAt)}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => onOpenChamadoPdv(p)}
                      className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
                    >
                      + Chamado
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Atualizações" count={data.atualizacoes.length}>
        {data.atualizacoes.length === 0 ?
          <p className="text-sm text-slate-500">Nenhuma atualização registrada.</p>
        : <ul className="space-y-2">
            {data.atualizacoes.slice(0, 30).map((a) => (
              <AtualizacaoRow key={`${a.tipo}-${a.id}`} item={a} />
            ))}
          </ul>
        }
      </Section>

      <Section title="Feedbacks do cliente" count={data.feedbacks.length}>
        {data.feedbacks.length === 0 ?
          <p className="text-sm text-slate-500">Nenhum feedback recebido pelo Player.</p>
        : <ul className="space-y-2">
            {data.feedbacks.map((f) => (
              <FeedbackRow key={f.id} item={f} />
            ))}
          </ul>
        }
      </Section>

      <p className="text-center">
        <button type="button" onClick={onReload} className="text-xs text-slate-500 hover:text-slate-700">
          Atualizar dados
        </button>
      </p>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function ChamadoRow({ chamado }: { chamado: ChamadoView }) {
  const pri = prioridadeMeta(chamado.prioridade);
  const col = CHAMADO_COLUNAS.find((c) => c.id === chamado.status);
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
      <span className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full " + pri.dot} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-white">{chamado.titulo}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {col?.label ?? chamado.status} · {pri.label} · {fmtWhen(chamado.updatedAt)}
          {chamado.rioPdvKey ? " · PDV específico" : null}
        </p>
      </div>
      <Link href="/chamados" className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
        Ver quadro
      </Link>
    </li>
  );
}

function AtualizacaoRow({ item }: { item: ClienteAtualizacaoItem }) {
  return (
    <li className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{item.rotulo}</span>
        <span className="text-xs text-slate-500">{fmtWhen(item.quando)}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {item.tipo === "cadastro" ? "Cadastro Player" : "Programação musical"}
        {item.pdvNome ? ` · ${item.pdvNome}` : ""}
        {item.status ? ` · ${item.status}` : ""}
      </p>
      {item.detalhe ?
        <p className="mt-1 text-xs text-slate-400">{item.detalhe}</p>
      : null}
    </li>
  );
}

function FeedbackRow({ item }: { item: ClienteFeedbackItem }) {
  return (
    <li className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{item.pdvNome || "PDV"}</span>
        <span className="text-xs text-slate-500">{fmtWhen(item.createdAt)}</span>
      </div>
      <p className="mt-1 text-slate-700 dark:text-slate-300">{item.mensagem || "Sem mensagem"}</p>
      <p className="mt-1 text-xs text-slate-500">
        Status: {item.status}
        {item.chamadoId ? " · gerou chamado" : ""}
      </p>
    </li>
  );
}

function NovoChamadoModal({
  target,
  onClose,
  onCreated,
}: {
  target: ChamadoTarget;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<ChamadoPrioridade>("media");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const contextLabel =
    target.kind === "cliente" ?
      `Cliente: ${target.clienteNome}`
    : `PDV: ${target.pdvNome} (${target.clienteNome})`;

  async function submit() {
    if (!titulo.trim()) {
      setErr("Informe um título.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/chamados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          titulo,
          descricao,
          prioridade,
          setores: ["relacionamento"],
          responsaveis: [],
          rioLinhaId: target.rioLinhaId,
          rioPdvKey: target.kind === "pdv" ? target.rioPdvKey : null,
          clienteNome: target.clienteNome,
        }),
      });
      if (!res.ok) throw new Error("Não foi possível criar o chamado.");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao criar chamado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Novo chamado</h2>
        <p className="mt-1 text-sm text-slate-500">{contextLabel}</p>
        {err ?
          <p className="mt-2 text-sm text-rose-600">{err}</p>
        : null}
        <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Título
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Descrição
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Prioridade</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {CHAMADO_PRIORIDADES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrioridade(p.id)}
                className={
                  "rounded-full px-3 py-1 text-xs font-semibold " +
                  (prioridade === p.id ? "ring-2 " + p.ring : "bg-slate-100 opacity-70 dark:bg-slate-800")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
          >
            {busy ? "Abrindo…" : "Abrir chamado"}
          </button>
        </div>
      </div>
    </div>
  );
}
