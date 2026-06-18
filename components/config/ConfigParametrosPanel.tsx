"use client";

import { useEffect, useState } from "react";

export function ConfigParametrosPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pontoMix, setPontoMix] = useState(4);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/parametros")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.pontoMixPadraoSeg === "number") {
          setPontoMix(d.pontoMixPadraoSeg);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/config/parametros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pontoMixPadraoSeg: pontoMix }),
      });
      if (!res.ok) throw new Error("save_failed");
      const d = (await res.json()) as { pontoMixPadraoSeg: number };
      setPontoMix(d.pontoMixPadraoSeg);
      setMsg("Salvo.");
      setTimeout(() => setMsg(null), 2500);
    } catch {
      setMsg("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[800px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Configuração / Parâmetros globais
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Parâmetros globais</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Ajustes que valem para todo o portal e para o processamento de músicas.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold">Criação musical</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Ponto de mix padrão (segundos finais)
            </span>
            <input
              type="number"
              min={0}
              max={30}
              value={pontoMix}
              disabled={loading}
              onChange={(e) => setPontoMix(Number(e.target.value))}
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
        </div>
        <p className="mt-3 max-w-xl text-xs text-slate-500">
          Aplicado automaticamente a toda música no upload (fadeout para entrar a próxima faixa).
          Sem análise faixa a faixa — o criativo pode ajustar uma música específica depois em{" "}
          <strong>Criação › Edição de música</strong>.
        </p>
      </div>
    </div>
  );
}
