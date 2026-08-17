"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChamadoProducaoClienteOpcao } from "@/lib/chamados/chamadoProducaoTypes";
import {
  tituloChamadoParaCliente,
  tituloChamadoParaPdv,
} from "@/lib/chamados/chamadoProducaoTypes";

export type ChamadoVinculoModo = "livre" | "cliente" | "pdv";

export type ChamadoVinculoState = {
  modo: ChamadoVinculoModo;
  rioLinhaId: string | null;
  rioPdvKey: string | null;
  clienteNome: string;
  clienteKey: string | null;
  pdvKey: string | null;
};

export const CHAMADO_VINCULO_VAZIO: ChamadoVinculoState = {
  modo: "livre",
  rioLinhaId: null,
  rioPdvKey: null,
  clienteNome: "",
  clienteKey: null,
  pdvKey: null,
};

function parseOpcoes(data: unknown): ChamadoProducaoClienteOpcao[] {
  if (!data || typeof data !== "object" || !("clientes" in data)) return [];
  const rows = (data as { clientes?: unknown }).clientes;
  return Array.isArray(rows) ? (rows as ChamadoProducaoClienteOpcao[]) : [];
}

type Props = {
  vinculo: ChamadoVinculoState;
  titulo: string;
  onVinculoChange: (next: ChamadoVinculoState) => void;
  onTituloChange: (titulo: string) => void;
  tituloManual: boolean;
  onTituloManualChange: (manual: boolean) => void;
};

export function ChamadoProducaoVinculoFields({
  vinculo,
  titulo,
  onVinculoChange,
  onTituloChange,
  tituloManual,
  onTituloManualChange,
}: Props) {
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<ChamadoProducaoClienteOpcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (vinculo.modo === "livre") return;
    let canceled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const q = busca.trim();
        const url =
          q.length > 0
            ? `/api/chamados/producao-opcoes?q=${encodeURIComponent(q)}`
            : "/api/chamados/producao-opcoes";
        const res = await fetch(url, { credentials: "same-origin" });
        const data = res.ok ? await res.json() : null;
        if (!res.ok) throw new Error("Falha ao carregar produção.");
        if (!canceled) setOpcoes(parseOpcoes(data));
      } catch (e) {
        if (!canceled) {
          setOpcoes([]);
          setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }, busca.trim() ? 250 : 0);
    return () => {
      canceled = true;
      clearTimeout(t);
    };
  }, [busca, vinculo.modo]);

  const clienteSel = useMemo(
    () => opcoes.find((c) => c.key === vinculo.clienteKey) ?? null,
    [opcoes, vinculo.clienteKey],
  );

  const pdvSel = useMemo(() => {
    if (!clienteSel || !vinculo.pdvKey) return null;
    return clienteSel.pdvs.find((p) => p.rioPdvKey === vinculo.pdvKey) ?? null;
  }, [clienteSel, vinculo.pdvKey]);

  function setModo(modo: ChamadoVinculoModo) {
    onVinculoChange({ ...CHAMADO_VINCULO_VAZIO, modo });
    onTituloManualChange(false);
    setBusca("");
    if (modo === "livre") onTituloChange("");
  }

  function pickCliente(c: ChamadoProducaoClienteOpcao) {
    onVinculoChange({
      modo: "cliente",
      clienteKey: c.key,
      clienteNome: c.nome,
      rioLinhaId: c.rioLinhaId,
      rioPdvKey: null,
      pdvKey: null,
    });
    if (!tituloManual) onTituloChange(tituloChamadoParaCliente(c.nome));
    setBusca(c.nome);
  }

  function pickPdv(c: ChamadoProducaoClienteOpcao, p: { rioPdvKey: string; nome: string }) {
    onVinculoChange({
      modo: "pdv",
      clienteKey: c.key,
      clienteNome: c.nome,
      rioLinhaId: c.rioLinhaId,
      rioPdvKey: p.rioPdvKey,
      pdvKey: p.rioPdvKey,
    });
    if (!tituloManual) onTituloChange(tituloChamadoParaPdv(p.nome, c.nome));
    setBusca(`${p.nome} — ${c.nome}`);
  }

  const resumoVinculo =
    vinculo.modo === "cliente" && vinculo.clienteNome
      ? `Cliente: ${vinculo.clienteNome}`
      : vinculo.modo === "pdv" && pdvSel
        ? `PDV: ${pdvSel.nome} (${vinculo.clienteNome})`
        : null;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Vínculo (Produção)</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Opcional. Lista do catálogo de Produção — não usa Conta Azul nem planilha Rio.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["livre", "Assunto livre"],
              ["cliente", "Cliente"],
              ["pdv", "PDV"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setModo(id)}
              className={
                "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
                (vinculo.modo === id
                  ? "bg-violet-600 text-white ring-2 ring-violet-300"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {vinculo.modo !== "livre" ?
        <>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Buscar {vinculo.modo === "cliente" ? "cliente" : "cliente ou PDV"}
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite para filtrar…"
            />
          </label>
          {loadErr ?
            <p className="text-xs text-rose-600">{loadErr}</p>
          : null}
          {loading ?
            <p className="text-xs text-slate-500">Carregando catálogo…</p>
          : null}
          {!loading && opcoes.length > 0 ?
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              {opcoes.map((c) =>
                vinculo.modo === "cliente" ?
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => pickCliente(c)}
                    className={
                      "block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-violet-50 dark:border-slate-800 dark:hover:bg-violet-950/40 " +
                      (vinculo.clienteKey === c.key ? "bg-violet-50 font-semibold dark:bg-violet-950/50" : "")
                    }
                  >
                    {c.nome}
                    <span className="ml-2 text-[10px] text-slate-400">{c.pdvs.length} PDV(s)</span>
                  </button>
                : (
                  <div key={c.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {c.nome}
                    </p>
                    {c.pdvs.map((p) => (
                      <button
                        key={p.rioPdvKey}
                        type="button"
                        onClick={() => pickPdv(c, p)}
                        className={
                          "block w-full px-3 py-2 pl-5 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-950/40 " +
                          (vinculo.pdvKey === p.rioPdvKey ? "bg-violet-50 font-semibold dark:bg-violet-950/50" : "")
                        }
                      >
                        {p.nome}
                      </button>
                    ))}
                  </div>
                ),
              )}
            </div>
          : null}
          {!loading && busca.trim() && opcoes.length === 0 ?
            <p className="text-xs text-slate-500">Nenhum resultado. Cliente novo? Use «Assunto livre».</p>
          : null}
          {resumoVinculo ?
            <p className="text-xs font-medium text-violet-700 dark:text-violet-300">{resumoVinculo}</p>
          : null}
        </>
      : null}

      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
        Assunto do chamado
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          value={titulo}
          onChange={(e) => {
            onTituloManualChange(true);
            onTituloChange(e.target.value);
          }}
          maxLength={200}
          placeholder={
            vinculo.modo === "livre"
              ? "Ex.: Prospect novo — reunião comercial"
              : "Preenchido ao escolher cliente/PDV (pode editar)"
          }
        />
      </label>
      {vinculo.modo !== "livre" && !tituloManual && titulo ?
        <p className="text-[10px] text-slate-500">Assunto sugerido pela seleção — edite se precisar.</p>
      : null}
    </div>
  );
}
