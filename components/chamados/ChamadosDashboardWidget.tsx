"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { CHAMADO_COLUNAS, prioridadeMeta, setorMeta } from "@/lib/chamados/chamadoConstants";

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

function parseChamados(data: unknown): ChamadoView[] {
  if (!data || typeof data !== "object" || !("chamados" in data)) return [];
  const rows = (data as { chamados?: unknown }).chamados;
  if (!Array.isArray(rows)) return [];
  return rows as ChamadoView[];
}

export function ChamadosDashboardWidget() {
  const [items, setItems] = useState<ChamadoView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chamados?scope=mine", { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      setItems(parseChamados(data).slice(0, 6));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = items.length;

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 shadow-sm dark:border-orange-900/40 dark:from-orange-950/30 dark:via-slate-900 dark:to-amber-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-200/80 bg-orange-100/60 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/40">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            🎫
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
              Seus chamados abertos
            </p>
            <p className="text-xs text-orange-700/80 dark:text-orange-200/70">
              Onde você ou seu setor participa
            </p>
          </div>
        </div>
        <Link
          href="/chamados"
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600"
        >
          Ver todos →
        </Link>
      </div>

      <div className="p-4">
        {loading ?
          <p className="text-sm text-slate-500">Carregando chamados…</p>
        : count === 0 ?
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Nenhum chamado aberto para você no momento.{" "}
            <Link href="/chamados" className="font-semibold text-orange-600 hover:underline dark:text-orange-400">
              Abrir quadro
            </Link>
          </p>
        : <ul className="space-y-2">
            {items.map((c) => {
              const pri = prioridadeMeta(c.prioridade);
              const col = CHAMADO_COLUNAS.find((x) => x.id === c.status);
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/80"
                >
                  <span className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 " + pri.ring + " " + pri.dot} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{c.titulo}</p>
                    <p className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium dark:bg-slate-800">
                        {col?.label ?? c.status}
                      </span>
                      <span>{pri.label}</span>
                      <span>· {fmtWhen(c.updatedAt)}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.setores.slice(0, 3).map((s) => {
                        const meta = setorMeta(s);
                        return (
                          <span
                            key={s}
                            className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + meta.bg}
                          >
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        }
      </div>
    </section>
  );
}

export function useOpenChamadosCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chamados?scope=mine", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setCount(parseChamados(data).length);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
