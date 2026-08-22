"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PdvCadastroDrawer } from "@/components/cadastros/PdvCadastroDrawer";
import { CopyTextButton } from "@/components/CopyTextButton";
import { RioTagCobrancaNome } from "@/components/rio/RioTagCobrancaNome";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";
import type {
  AtendimentoRelaPayload,
  RelaFinanceiroClienteRow,
  RelaFinanceiroMarcaBlock,
  RelaProducaoClienteRow,
} from "@/lib/atendimento/relaService";
import { formatRioPrimeiroPing } from "@/lib/rio/enrichRioLinhasPrimeiroPing";
import {
  rioTagCobrancaRowBgClass,
  rioTagCobrancaTextClass,
} from "@/lib/rio/rioTagCobranca";

type Modo = "financeiro" | "producao";

function matchQ(text: string, q: string): boolean {
  if (!q.trim()) return true;
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

function filterFinanceiroBlocks(
  blocks: RelaFinanceiroMarcaBlock[],
  q: string,
): RelaFinanceiroMarcaBlock[] {
  if (!q.trim()) return blocks;
  return blocks
    .map((b) => ({
      ...b,
      clientes: b.clientes.filter(
        (r) =>
          matchQ(r.cliente, q) ||
          matchQ(r.cnpj, q) ||
          matchQ(r.emailCobranca, q) ||
          r.pdvs.some((p) => matchQ(p.nome, q)),
      ),
    }))
    .filter((b) => b.clientes.length > 0 || matchQ(b.nome, q));
}

function filterProducao(rows: RelaProducaoClienteRow[], q: string): RelaProducaoClienteRow[] {
  if (!q.trim()) return rows;
  return rows.filter(
    (r) =>
      matchQ(r.nome, q) ||
      matchQ(r.documento ?? "", q) ||
      r.pdvs.some(
        (p) =>
          matchQ(p.nome, q) ||
          matchQ(p.documento ?? "", q) ||
          matchQ(p.contatoLojaNome, q) ||
          matchQ(p.contatoLojaEmail, q) ||
          matchQ(p.portalPdvLabel ?? "", q),
      ),
  );
}

function financeiroClienteRowClass(row: RelaFinanceiroClienteRow): string {
  const tagBg = rioTagCobrancaRowBgClass(row.tagCobranca);
  if (tagBg) return `${tagBg} border-b align-middle h-8`;
  if (row.temPdvs) {
    return "border-b align-middle h-8 border-emerald-200/70 bg-emerald-50/90 dark:border-emerald-900/55 dark:bg-emerald-950/80";
  }
  return "border-b align-middle h-8 border-slate-100 bg-white dark:border-slate-900 dark:bg-slate-950";
}

function financeiroPdvRowClass(tag: RelaFinanceiroClienteRow["tagCobranca"]): string {
  const tagBg = rioTagCobrancaRowBgClass(tag);
  return tagBg ?
      `${tagBg} border-b align-middle text-[10px]`
    : "border-b align-middle text-[10px] border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40";
}

function copyableText(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t !== "—" ? t : "";
}

function CopyCell({
  text,
  label,
  mono,
  className = "",
}: {
  text: string;
  label: string;
  mono?: boolean;
  className?: string;
}) {
  const trimmed = copyableText(text);
  const display = text.trim() || "—";
  return (
    <div className={"flex min-w-0 items-center gap-0.5 " + className}>
      <span
        className={
          (mono ?
            "min-w-0 flex-1 truncate font-mono text-[10px]"
          : "min-w-0 flex-1 truncate") + " text-inherit"
        }
        title={display !== "—" ? display : undefined}
      >
        {display}
      </span>
      {trimmed ?
        <CopyTextButton size="compact" variant="icon" text={trimmed} label={label} />
      : null}
    </div>
  );
}

function financeiroClienteCopyAll(row: RelaFinanceiroClienteRow): string {
  return [row.cliente, copyableText(row.cnpj), copyableText(row.emailCobranca)].filter(Boolean).join("\t");
}

function producaoClienteCopyAll(c: RelaProducaoClienteRow): string {
  const head = [c.nome, copyableText(c.documento ?? "")].filter(Boolean).join("\t");
  const pdvs = c.pdvs
    .map((p) =>
      [
        p.nome,
        copyableText(p.documento ?? ""),
        copyableText(p.contatoLojaNome),
        copyableText(p.contatoLojaEmail),
        copyableText(p.contatoLojaTelefone),
        copyableText(p.portalPdvLabel ?? ""),
      ]
        .filter(Boolean)
        .join("\t"),
    )
    .join("\n");
  return pdvs ? `${head}\n${pdvs}` : head;
}

function producaoPdvCopyAll(p: RelaProducaoClienteRow["pdvs"][number]): string {
  return [
    p.nome,
    copyableText(p.documento ?? ""),
    copyableText(p.contatoLojaNome),
    copyableText(p.contatoLojaEmail),
    copyableText(p.contatoLojaTelefone),
    copyableText(p.portalPdvLabel ?? ""),
  ]
    .filter(Boolean)
    .join("\t");
}

export function AtendimentoRelaPanel() {
  const [modo, setModo] = useState<Modo>("financeiro");
  const [data, setData] = useState<AtendimentoRelaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [openClientes, setOpenClientes] = useState<Set<string>>(new Set());
  const [collapsedMarcas, setCollapsedMarcas] = useState<Set<string>>(new Set());
  const [marcasFechadas, setMarcasFechadas] = useState(true);
  const [cadastroPdvKey, setCadastroPdvKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/atendimento/rela");
      const json = (await res.json()) as AtendimentoRelaPayload & { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao carregar Rela.");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro de conexão.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const financeiro = useMemo(
    () => filterFinanceiroBlocks(data?.financeiro ?? [], q),
    [data?.financeiro, q],
  );
  const producao = useMemo(() => filterProducao(data?.producao ?? [], q), [data?.producao, q]);

  const financeiroClienteTotal = useMemo(
    () => financeiro.reduce((n, b) => n + b.clientes.length, 0),
    [financeiro],
  );

  useEffect(() => {
    if (!data || !marcasFechadas) return;
    setCollapsedMarcas(new Set(data.financeiro.map((b) => b.id)));
  }, [data, marcasFechadas]);

  function setTodasMarcasFechadas(fechadas: boolean) {
    setMarcasFechadas(fechadas);
    const ids = (data?.financeiro ?? []).map((b) => b.id);
    setCollapsedMarcas(fechadas ? new Set(ids) : new Set());
  }

  function toggleCliente(id: string) {
    setOpenClientes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMarca(id: string) {
    setCollapsedMarcas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCadastro(rioPdvKey: string) {
    setCadastroPdvKey(rioPdvKey);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setModo("financeiro")}
            className={
              "rounded-md px-3 py-1.5 text-sm font-semibold transition " +
              (modo === "financeiro" ?
                "bg-emerald-100 text-emerald-950 shadow-sm dark:bg-emerald-950/50 dark:text-emerald-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
            }
          >
            Clientes financeiro
          </button>
          <button
            type="button"
            onClick={() => setModo("producao")}
            className={
              "rounded-md px-3 py-1.5 text-sm font-semibold transition " +
              (modo === "producao" ?
                "bg-violet-100 text-violet-950 shadow-sm dark:bg-violet-950/50 dark:text-violet-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
            }
          >
            Clientes produção
          </button>
        </div>

        {data ?
          <span className="text-xs text-zinc-500">
            Espelho Rio: {formatYearMonthLabel(data.yearMonth)} · somente leitura
          </span>
        : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            className="portal-input min-w-[200px] text-sm"
            placeholder="Buscar cliente, CNPJ, PDV…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="portal-btn text-sm" disabled={loading} onClick={() => void load()}>
            {loading ? "…" : "Atualizar"}
          </button>
        </div>
      </div>

      {err ?
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      : null}

      {loading && !data ?
        <p className="text-sm text-zinc-500">Carregando…</p>
      : null}

      {modo === "financeiro" ?
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-[#FAFAF7] dark:border-slate-700 dark:bg-slate-950">
          <div className="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#C4146A]">
                  Planilha Rio · espelho financeiro
                </p>
                <p className="text-xs text-slate-500">
                  {financeiroClienteTotal} cliente(s) · {financeiro.length} marca(s) · sem vínculo Conta Azul
                </p>
              </div>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={marcasFechadas}
                    onChange={(e) => setTodasMarcasFechadas(e.target.checked)}
                  />
                  Marcas fechadas
                </label>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => setTodasMarcasFechadas(true)}
                >
                  Fechar todas
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => setTodasMarcasFechadas(false)}
                >
                  Abrir todas
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto p-2">
            {financeiro.length === 0 ?
              <p className="px-3 py-8 text-center text-sm text-slate-500">Nenhum cliente encontrado.</p>
            : <table className="min-w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <th className="w-8 px-1 py-1.5" title="Copiar linha (cliente, CNPJ, e-mail)">
                      ⧉
                    </th>
                    <th className="min-w-[7rem] px-2 py-1.5">Marca bloco</th>
                    <th className="px-2 py-1.5">Cliente</th>
                    <th className="px-2 py-1.5">CNPJ</th>
                    <th className="px-2 py-1.5">Valor</th>
                    <th className="px-2 py-1.5">Nº PDV</th>
                    <th className="px-2 py-1.5">E-mail cobrança</th>
                    <th className="px-2 py-1.5">1º ping</th>
                  </tr>
                </thead>
                {financeiro.map((marca) => {
                  const marcaOpen = !collapsedMarcas.has(marca.id);
                  return (
                    <tbody key={marca.id} className="border-x border-slate-800/85">
                      <tr className="border-x border-emerald-950/65 bg-emerald-800 text-emerald-50 dark:border-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
                        <td colSpan={8} className="px-3 py-1">
                          <button
                            type="button"
                            className="flex w-full flex-wrap items-center gap-3 text-left text-[11px] font-semibold"
                            onClick={() => toggleMarca(marca.id)}
                          >
                            <span className="text-emerald-200">{marcaOpen ? "▾" : "▸"}</span>
                            <span className="truncate tracking-wide">MARCA — {marca.nome}</span>
                            <span className="ms-auto shrink-0 tabular-nums text-[10px]">
                              Subtotal: <span className="font-bold">{marca.valorTotalLabel}</span>
                              {" · "}
                              {marca.pdvTotal} PDV{marca.pdvTotal === 1 ? "" : "s"}
                              {" · "}
                              {marca.clienteCount} cliente{marca.clienteCount === 1 ? "" : "s"}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {marcaOpen ?
                        marca.clientes.map((row) => {
                          const open = openClientes.has(row.id);
                          const linhaTagClass = rioTagCobrancaTextClass(row.tagCobranca);
                          return (
                            <Fragment key={row.id}>
                              <tr className={financeiroClienteRowClass(row)}>
                                <td className="px-1 py-1 align-middle">
                                  {financeiroClienteCopyAll(row) ?
                                    <CopyTextButton
                                      size="compact"
                                      variant="icon"
                                      text={financeiroClienteCopyAll(row)}
                                      label="Copiar cliente, CNPJ e e-mail"
                                    />
                                  : null}
                                </td>
                                <td
                                  className="max-w-[8rem] truncate px-2 py-1 align-middle text-[10px] font-semibold text-emerald-900 dark:text-emerald-200"
                                  title={marca.nome}
                                >
                                  {marca.nome}
                                </td>
                                <td className="max-w-[14rem] px-2 py-1">
                                  <div className={linhaTagClass || undefined}>
                                    <div className="flex min-w-0 items-start gap-0.5">
                                      {row.temPdvs ?
                                        <button
                                          type="button"
                                          className="inline-flex min-w-0 flex-1 items-center gap-1 text-left font-semibold hover:underline"
                                          onClick={() => toggleCliente(row.id)}
                                        >
                                          <span className="shrink-0 text-slate-400">{open ? "▾" : "▸"}</span>
                                          <span className="min-w-0 truncate">
                                            <RioTagCobrancaNome nome={row.cliente} tag={row.tagCobranca} />
                                          </span>
                                        </button>
                                      : <span className="min-w-0 truncate font-semibold">
                                          <RioTagCobrancaNome nome={row.cliente} tag={row.tagCobranca} />
                                        </span>}
                                      <CopyTextButton
                                        size="compact"
                                        variant="icon"
                                        text={copyableText(row.cliente)}
                                        label="Copiar nome do cliente"
                                      />
                                    </div>
                                    {row.temPdvs ?
                                      <button
                                        type="button"
                                        className="mt-0.5 block text-left text-[9px] text-emerald-800 underline dark:text-emerald-300"
                                        onClick={() => toggleCliente(row.id)}
                                      >
                                        PDVs / detalhes
                                      </button>
                                    : null}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-2 py-1">
                                  <CopyCell text={row.cnpj} label="Copiar CNPJ" mono />
                                </td>
                                <td className="max-w-[6.75rem] truncate px-2 py-1">{row.valor}</td>
                                <td className="px-2 py-1 tabular-nums">{row.nPdvs}</td>
                                <td className="max-w-[10rem] px-2 py-1 text-sky-800 dark:text-sky-400">
                                  <CopyCell text={row.emailCobranca} label="Copiar e-mail de cobrança" />
                                </td>
                                <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                                  {formatRioPrimeiroPing(row.primeiroPingEm)}
                                </td>
                              </tr>
                              {open && row.temPdvs ?
                                row.pdvs.map((p) => (
                                  <tr key={`${row.id}-${p.id}`} className={financeiroPdvRowClass(p.tagCobranca)}>
                                    <td className="px-1 py-1" />
                                    <td className="px-2 py-1" />
                                    <td className="px-2 py-1 pl-6">
                                      <div className="flex min-w-0 items-center gap-0.5">
                                        <span className="min-w-0 truncate">
                                          📻{" "}
                                          <RioTagCobrancaNome nome={p.nome} tag={p.tagCobranca} className="font-medium" />
                                        </span>
                                        <CopyTextButton
                                          size="compact"
                                          variant="icon"
                                          text={copyableText(p.nome)}
                                          label="Copiar nome do PDV"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-1">
                                      <CopyCell text={formatDoc(p.documento)} label="Copiar CNPJ do PDV" mono />
                                    </td>
                                    <td colSpan={3} />
                                    <td className="px-2 py-1">{formatRioPrimeiroPing(p.primeiroPingEm)}</td>
                                  </tr>
                                ))
                              : null}
                            </Fragment>
                          );
                        })
                      : null}
                    </tbody>
                  );
                })}
              </table>
            }
          </div>
        </div>
      : <div className="overflow-hidden rounded-xl border border-violet-200 bg-white dark:border-violet-900/50 dark:bg-zinc-900">
          <div className="border-b border-violet-100 bg-violet-50/80 px-4 py-2 dark:border-violet-900/40 dark:bg-violet-950/20">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">
              Produção musical
            </p>
            <p className="text-xs text-violet-800/80 dark:text-violet-300/80">
              {producao.length} grupo(s) · use o botão «Cadastro» para editar cada PDV
            </p>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {producao.length === 0 ?
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Nenhum cliente na produção.</p>
            : producao.map((c) => {
                const open = openClientes.has(c.key);
                return (
                  <div key={c.key}>
                    <div className="flex w-full items-center gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => toggleCliente(c.key)}
                      >
                        <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{c.nome}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                            <span>{c.pdvCount} PDV(s)</span>
                            {c.documento ?
                              <span className="font-mono">{formatDoc(c.documento)}</span>
                            : null}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <CopyTextButton
                          size="compact"
                          variant="icon"
                          text={copyableText(c.nome)}
                          label="Copiar nome do cliente"
                        />
                        {c.documento ?
                          <CopyTextButton
                            size="compact"
                            variant="icon"
                            text={copyableText(c.documento)}
                            label="Copiar CNPJ do cliente"
                          />
                        : null}
                        {producaoClienteCopyAll(c) ?
                          <CopyTextButton
                            size="compact"
                            variant="icon"
                            text={producaoClienteCopyAll(c)}
                            label="Copiar todas as informações do cliente"
                          />
                        : null}
                      </div>
                    </div>
                    {open ?
                      <div className="border-t border-zinc-100 px-2 py-2 dark:border-zinc-800">
                        <div className="hidden overflow-x-auto md:block">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                                <th className="w-8 px-2 py-1" title="Copiar linha completa">
                                  ⧉
                                </th>
                                <th className="px-2 py-1">PDV</th>
                                <th className="px-2 py-1">CNPJ</th>
                                <th className="px-2 py-1">Contato loja</th>
                                <th className="px-2 py-1">E-mail loja</th>
                                <th className="px-2 py-1">Telefone loja</th>
                                <th className="px-2 py-1">Player</th>
                                <th className="px-2 py-1" />
                              </tr>
                            </thead>
                            <tbody>
                              {c.pdvs.map((p) => (
                                <tr
                                  key={p.rioPdvKey}
                                  className="border-t border-zinc-100 dark:border-zinc-800"
                                >
                                  <td className="px-2 py-2 align-middle">
                                    {producaoPdvCopyAll(p) ?
                                      <CopyTextButton
                                        size="compact"
                                        variant="icon"
                                        text={producaoPdvCopyAll(p)}
                                        label="Copiar todas as informações do PDV"
                                      />
                                    : null}
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="flex min-w-0 items-center gap-0.5 font-medium">
                                      <span className="min-w-0 truncate">
                                        {p.nome}
                                        {p.isLinhaProxy ?
                                          <span className="ml-1 text-[10px] text-amber-600">· cliente = PDV</span>
                                        : null}
                                      </span>
                                      <CopyTextButton
                                        size="compact"
                                        variant="icon"
                                        text={copyableText(p.nome)}
                                        label="Copiar nome do PDV"
                                      />
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-2">
                                    <CopyCell text={formatDoc(p.documento)} label="Copiar CNPJ" mono />
                                  </td>
                                  <td className="px-2 py-2">
                                    <CopyCell text={p.contatoLojaNome} label="Copiar contato da loja" />
                                  </td>
                                  <td className="max-w-[10rem] px-2 py-2">
                                    <CopyCell text={p.contatoLojaEmail} label="Copiar e-mail da loja" />
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-2">
                                    <CopyCell text={p.contatoLojaTelefone} label="Copiar telefone da loja" />
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-2">
                                    {p.portalPdvLabel ?
                                      <CopyCell text={p.portalPdvLabel} label="Copiar nº player" mono />
                                    : <span className="text-amber-700 dark:text-amber-400">Sem ID</span>}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      type="button"
                                      className="rounded-md border border-violet-400 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/60"
                                      onClick={() => openCadastro(p.rioPdvKey)}
                                    >
                                      Cadastro
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-2 md:hidden">
                          {c.pdvs.map((p) => (
                            <div
                              key={p.rioPdvKey}
                              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="flex min-w-0 flex-1 items-center gap-1 font-semibold">
                                  <span className="min-w-0 truncate">{p.nome}</span>
                                  <CopyTextButton
                                    size="compact"
                                    variant="icon"
                                    text={copyableText(p.nome)}
                                    label="Copiar nome do PDV"
                                  />
                                </p>
                                {producaoPdvCopyAll(p) ?
                                  <CopyTextButton
                                    size="compact"
                                    variant="icon"
                                    text={producaoPdvCopyAll(p)}
                                    label="Copiar todas as informações do PDV"
                                  />
                                : null}
                              </div>
                              <dl className="mt-2 grid gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                                <div className="flex items-center gap-1">
                                  <dt className="font-medium">CNPJ:</dt>
                                  <dd>
                                    <CopyCell text={formatDoc(p.documento)} label="Copiar CNPJ" mono />
                                  </dd>
                                </div>
                                <div className="flex items-center gap-1">
                                  <dt className="font-medium">Contato:</dt>
                                  <dd>
                                    <CopyCell text={p.contatoLojaNome} label="Copiar contato" />
                                  </dd>
                                </div>
                                <div className="flex items-center gap-1">
                                  <dt className="font-medium">E-mail:</dt>
                                  <dd>
                                    <CopyCell text={p.contatoLojaEmail} label="Copiar e-mail" />
                                  </dd>
                                </div>
                                <div className="flex items-center gap-1">
                                  <dt className="font-medium">Telefone:</dt>
                                  <dd>
                                    <CopyCell text={p.contatoLojaTelefone} label="Copiar telefone" />
                                  </dd>
                                </div>
                                <div className="flex items-center gap-1">
                                  <dt className="font-medium">Player:</dt>
                                  <dd>
                                    {p.portalPdvLabel ?
                                      <CopyCell text={p.portalPdvLabel} label="Copiar nº player" mono />
                                    : "Sem ID"}
                                  </dd>
                                </div>
                              </dl>
                              <button
                                type="button"
                                className="mt-2 w-full rounded-md border border-violet-400 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-900 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-100"
                                onClick={() => openCadastro(p.rioPdvKey)}
                              >
                                Cadastro
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    : null}
                  </div>
                );
              })
            }
          </div>
        </div>
      }

      {cadastroPdvKey ?
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
          <PdvCadastroDrawer
            rioPdvKey={cadastroPdvKey}
            editMode
            onClose={() => setCadastroPdvKey(null)}
            onSaved={() => void load()}
          />
        </div>
      : null}
    </div>
  );
}

function formatDoc(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t || "—";
}
