"use client";

import { useCallback, useEffect, useState } from "react";

type ProgRow = {
  id: string;
  nome: string;
  clienteNome: string;
  pastas: { id: string; nome: string; musicaCount: number }[];
};

export function CopiarParaProgramacaoModal({
  musicaIds,
  onClose,
  onDone,
}: {
  musicaIds: string[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const [progs, setProgs] = useState<ProgRow[]>([]);
  const [progId, setProgId] = useState("");
  const [pastaId, setPastaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/criacao/biblioteca/sidebar");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          programacoes: {
            id: string;
            nome: string;
            clienteNome: string;
            pastas: { id: string; nome: string; musicaCount: number }[];
          }[];
        };
        setProgs(
          data.programacoes.map((p) => ({
            id: p.id,
            nome: p.nome,
            clienteNome: p.clienteNome,
            pastas: p.pastas.map((pa) => ({
              id: pa.id,
              nome: pa.nome,
              musicaCount: pa.musicaCount,
            })),
          })),
        );
      } catch {
        setErr("Não foi possível carregar programações.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const prog = progs.find((p) => p.id === progId);
  const pastas = prog?.pastas ?? [];

  const confirm = useCallback(async () => {
    if (!pastaId || musicaIds.length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/criacao/pastas/${encodeURIComponent(pastaId)}/musicas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicaIds }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "copy_failed");
      }
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao copiar.");
    } finally {
      setSaving(false);
    }
  }, [musicaIds, onClose, onDone, pastaId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Copiar para pasta de programação</h2>
        <p className="mt-1 text-sm text-slate-500">
          {musicaIds.length} faixa{musicaIds.length === 1 ? "" : "s"} — não altera pastas de programação pela
          biblioteca; só adiciona cópias na pasta escolhida.
        </p>

        {loading ?
          <p className="mt-4 text-sm text-slate-500">Carregando…</p>
        : <>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Cliente · Programação</span>
              <select
                value={progId}
                onChange={(e) => {
                  setProgId(e.target.value);
                  setPastaId("");
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Selecione…</option>
                {progs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clienteNome} · {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Pasta</span>
              <select
                value={pastaId}
                disabled={!progId}
                onChange={(e) => setPastaId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Selecione…</option>
                {pastas.map((pa) => (
                  <option key={pa.id} value={pa.id}>
                    {pa.nome} ({pa.musicaCount})
                  </option>
                ))}
              </select>
            </label>
          </>
        }

        {err ?
          <p className="mt-3 text-sm text-red-600">{err}</p>
        : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !pastaId}
            onClick={() => void confirm()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {saving ? "Copiando…" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
