"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProgramacaoDono } from "@/lib/criacao/programacaoDonoLocal";
import { useProgramacaoDonoMap } from "@/lib/criacao/useProgramacaoDonoMap";
import type {
  MigracaoClienteRow,
  MigracaoProgramacaoStatus,
} from "@/lib/suporte/migracaoService";

type MigracaoSortField =
  | "cliente"
  | "dono"
  | "pdvsAmarrados"
  | "temProgramacao"
  | "statusProgramacao"
  | "algumPdvInstalado"
  | "instalacaoPdvs"
  | "ultimoPing";

type DonoDisplay = {
  nome: string;
  iniciais: string;
  cor: string;
};

const STATUS_RANK: Record<MigracaoProgramacaoStatus, number> = {
  AUSENTE: 0,
  CRIADA: 1,
  PRONTA: 2,
};

const MIGRACAO_TH =
  "sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-700 shadow-[0_1px_0_0_rgb(226_232_240)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_1px_0_0_rgb(51_65_85)]";

function fmtPing(iso: string | null): string {
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

function resolveDonoDisplay(
  row: MigracaoClienteRow,
  donoMap: Record<string, ProgramacaoDono>,
): DonoDisplay {
  if (row.programacaoId) {
    const local = donoMap[row.programacaoId];
    if (local) {
      return {
        nome: local.criativoNome,
        iniciais: local.criativoIniciais.trim().toUpperCase() || "?",
        cor: local.criativoCor || "#6366f1",
      };
    }
  }

  if (row.donoNome || row.donoEmail) {
    return {
      nome: row.donoNome ?? row.donoEmail ?? "—",
      iniciais: row.donoIniciais?.trim().toUpperCase() || "?",
      cor: row.donoCor ?? "#94a3b8",
    };
  }

  return { nome: "Sem dono", iniciais: "?", cor: "#94a3b8" };
}

function donoSortLabel(row: MigracaoClienteRow, donoMap: Record<string, ProgramacaoDono>): string {
  return resolveDonoDisplay(row, donoMap).nome;
}

function compareMigracaoRows(
  a: MigracaoClienteRow,
  b: MigracaoClienteRow,
  field: MigracaoSortField,
  order: "asc" | "desc",
  donoMap: Record<string, ProgramacaoDono>,
): number {
  let cmp = 0;

  switch (field) {
    case "cliente":
      cmp = a.clienteNome.localeCompare(b.clienteNome, "pt-BR", { sensitivity: "base" });
      break;
    case "dono":
      cmp = donoSortLabel(a, donoMap).localeCompare(donoSortLabel(b, donoMap), "pt-BR", {
        sensitivity: "base",
      });
      break;
    case "pdvsAmarrados":
      cmp = Number(a.pdvsAmarrados) - Number(b.pdvsAmarrados);
      break;
    case "temProgramacao":
      cmp = Number(a.temProgramacao) - Number(b.temProgramacao);
      break;
    case "statusProgramacao":
      cmp = STATUS_RANK[a.statusProgramacao] - STATUS_RANK[b.statusProgramacao];
      break;
    case "algumPdvInstalado":
      cmp = Number(a.algumPdvInstalado) - Number(b.algumPdvInstalado);
      break;
    case "instalacaoPdvs":
      cmp = Number(a.faltaPdvInstalar) - Number(b.faltaPdvInstalar);
      if (cmp === 0) cmp = a.pdvsSemPing - b.pdvsSemPing;
      break;
    case "ultimoPing":
      cmp =
        (Date.parse(a.ultimoPingEm ?? "") || 0) - (Date.parse(b.ultimoPingEm ?? "") || 0);
      break;
  }

  if (cmp === 0) {
    cmp = a.clienteNome.localeCompare(b.clienteNome, "pt-BR", { sensitivity: "base" });
  }

  return order === "asc" ? cmp : -cmp;
}

function SortButton({
  label,
  field,
  current,
  order,
  align = "left",
  onSort,
}: {
  label: string;
  field: MigracaoSortField;
  current: MigracaoSortField;
  order: "asc" | "desc";
  align?: "left" | "center";
  onSort: (field: MigracaoSortField) => void;
}) {
  const active = current === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={
        "inline-flex w-full items-center gap-1 font-semibold " +
        (align === "center" ? "justify-center " : "justify-start ") +
        (active ?
          "text-sky-700 dark:text-sky-300"
        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white")
      }
    >
      <span>{label}</span>
      {active ? <span className="text-[10px]">{order === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

function CheckCell({ ok, title }: { ok: boolean; title: string }) {
  return (
    <td className="px-3 py-2 text-center align-middle">
      <span
        title={title}
        className={
          ok
            ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-base font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300"
        }
        aria-label={ok ? "Sim" : "Não"}
      >
        {ok ? "✓" : "✗"}
      </span>
    </td>
  );
}

function DonoProgramacaoBadge({ dono }: { dono: DonoDisplay }) {
  return (
    <div className="flex min-w-[5.5rem] flex-col items-start gap-1">
      <span
        className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded px-1.5 text-[10px] font-bold text-white"
        style={{ backgroundColor: dono.cor }}
        title={dono.nome}
      >
        {dono.iniciais}
      </span>
      <span className="max-w-[8rem] truncate text-xs text-slate-600 dark:text-slate-300" title={dono.nome}>
        {dono.nome}
      </span>
    </div>
  );
}

function StatusInstalacaoPdvsBadge({
  faltaPdvInstalar,
  pdvsSemPing,
}: {
  faltaPdvInstalar: boolean;
  pdvsSemPing: number;
}) {
  if (faltaPdvInstalar) {
    return (
      <span
        title={`${pdvsSemPing} PDV${pdvsSemPing === 1 ? "" : "s"} sem primeiro ping`}
        className="inline-block rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-800 dark:bg-red-950/40 dark:text-red-200"
      >
        Falta
      </span>
    );
  }
  return (
    <span
      title="Todos os PDVs instaláveis já fizeram primeiro ping"
      className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
    >
      Finalizado
    </span>
  );
}

function StatusProgramacaoBadge({ status }: { status: MigracaoProgramacaoStatus }) {
  const cls =
    status === "PRONTA"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
      : status === "CRIADA"
        ? "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
        : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

export function MigracaoPanel() {
  const { map: donoMap } = useProgramacaoDonoMap();
  const [rows, setRows] = useState<MigracaoClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloud2Ok, setCloud2Ok] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<MigracaoSortField>("ultimoPing");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/suporte/migracao", { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: MigracaoClienteRow[];
        cloud2Ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setCloud2Ok(Boolean(data.cloud2Ok));
    } catch (e) {
      setRows([]);
      setCloud2Ok(false);
      setMsg(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSort(field: MigracaoSortField) {
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder(field === "cliente" || field === "dono" || field === "statusProgramacao" ? "asc" : "desc");
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base =
      q ?
        rows.filter((r) => {
          const dono = resolveDonoDisplay(r, donoMap);
          const hay = [
            r.clienteNome,
            r.clienteRef,
            r.programacaoNome ?? "",
            r.statusProgramacao,
            r.portalClienteId != null ? String(r.portalClienteId) : "",
            fmtPing(r.ultimoPingEm),
            String(r.pdvsComPing),
            String(r.pdvsSemPing),
            r.faltaPdvInstalar ? "falta" : "finalizado",
            dono.nome,
            dono.iniciais,
            r.donoEmail ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : rows;

    return [...base].sort((a, b) => compareMigracaoRows(a, b, sort, order, donoMap));
  }, [rows, busca, sort, order, donoMap]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Clientes com programação musical criada na Criação/Produção — checklist para migração e
        instalação do Player 5. Clique nos títulos das colunas para ordenar.
      </p>

      {!cloud2Ok && !loading ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Cloud2 indisponível — colunas de ping podem estar desatualizadas.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente, dono, programação, status…"
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
        <span className="text-sm text-slate-500">
          {filtrados.length} cliente{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {msg ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {msg}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="max-h-[min(78vh,calc(100dvh-12rem))] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <table className="portal-table w-full min-w-[1080px] text-sm">
            <thead>
              <tr>
                <th className={`${MIGRACAO_TH} text-left`}>
                  <SortButton
                    label="Cliente"
                    field="cliente"
                    current={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-left whitespace-nowrap`}>
                  <SortButton
                    label="Dono da programação"
                    field="dono"
                    current={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-center whitespace-nowrap`}>
                  <SortButton
                    label="PDVs amarrados?"
                    field="pdvsAmarrados"
                    current={sort}
                    order={order}
                    align="center"
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-center whitespace-nowrap`}>
                  <SortButton
                    label="Programação?"
                    field="temProgramacao"
                    current={sort}
                    order={order}
                    align="center"
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-left whitespace-nowrap`}>
                  <SortButton
                    label="Status programação"
                    field="statusProgramacao"
                    current={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-center whitespace-nowrap`}>
                  <SortButton
                    label="Algum PDV instalado?"
                    field="algumPdvInstalado"
                    current={sort}
                    order={order}
                    align="center"
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-center whitespace-nowrap`}>
                  <SortButton
                    label="Instalação PDVs"
                    field="instalacaoPdvs"
                    current={sort}
                    order={order}
                    align="center"
                    onSort={handleSort}
                  />
                </th>
                <th className={`${MIGRACAO_TH} text-left whitespace-nowrap`}>
                  <SortButton
                    label="Último ping"
                    field="ultimoPing"
                    current={sort}
                    order={order}
                    onSort={handleSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {rows.length === 0
                      ? "Nenhum cliente com programação criada."
                      : "Nenhum resultado para a busca."}
                  </td>
                </tr>
              ) : (
                filtrados.map((row, index) => {
                  const dono = resolveDonoDisplay(row, donoMap);
                  return (
                    <tr
                      key={row.clienteRef}
                      className={
                        index % 2 === 1
                          ? "bg-slate-50 dark:bg-slate-800/45"
                          : "bg-white dark:bg-slate-900"
                      }
                    >
                      <td className="px-4 py-2 align-top">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {row.clienteNome}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.portalClienteId != null ? `ID ${row.portalClienteId}` : row.clienteRef}
                          {row.programacaoNome ? ` · ${row.programacaoNome}` : null}
                        </div>
                        {row.totalPdvsInstalaveis > 0 ? (
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {row.pdvsComPing}/{row.totalPdvsInstalaveis} PDV
                            {row.totalPdvsInstalaveis === 1 ? "" : "s"} com ping
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <DonoProgramacaoBadge dono={dono} />
                      </td>
                      <CheckCell
                        ok={row.pdvsAmarrados}
                        title={
                          row.pdvsAmarrados
                            ? "Todos os PDVs instaláveis têm programação amarrada"
                            : "Há PDV instalável sem programação amarrada"
                        }
                      />
                      <CheckCell
                        ok={row.temProgramacao}
                        title={
                          row.temProgramacao
                            ? "Programação musical criada"
                            : "Sem programação criada"
                        }
                      />
                      <td className="px-3 py-2 align-middle">
                        <StatusProgramacaoBadge status={row.statusProgramacao} />
                      </td>
                      <CheckCell
                        ok={row.algumPdvInstalado}
                        title={
                          row.algumPdvInstalado
                            ? "Pelo menos um PDV já fez primeiro ping"
                            : "Nenhum PDV com ping registrado"
                        }
                      />
                      <td className="px-3 py-2 text-center align-middle">
                        <StatusInstalacaoPdvsBadge
                          faltaPdvInstalar={row.faltaPdvInstalar}
                          pdvsSemPing={row.pdvsSemPing}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 align-top text-slate-700 dark:text-slate-200">
                        {fmtPing(row.ultimoPingEm)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
