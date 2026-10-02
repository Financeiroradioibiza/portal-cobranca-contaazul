"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChamadosResumoView } from "@/lib/chamados/chamadoTypes";

const EMPTY: ChamadosResumoView = {
  chamadosNaoLidos: 0,
  conversasNaoLidas: 0,
  conversasMencoes: 0,
};

export function useChamadosResumo(enabled: boolean) {
  const [resumo, setResumo] = useState<ChamadosResumoView>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setResumo(EMPTY);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/chamados/resumo", { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      const r = (data as { resumo?: ChamadosResumoView })?.resumo;
      if (r && typeof r === "object") {
        setResumo({
          chamadosNaoLidos: Number(r.chamadosNaoLidos) || 0,
          conversasNaoLidas: Number(r.conversasNaoLidas) || 0,
          conversasMencoes: Number(r.conversasMencoes) || 0,
        });
      } else {
        setResumo(EMPTY);
      }
    } catch {
      setResumo(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => void load(), 45_000);
    const onBump = () => void load();
    window.addEventListener("chamados-resumo-changed", onBump);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("chamados-resumo-changed", onBump);
    };
  }, [enabled, load]);

  return { resumo, loading, reload: load };
}

/** Dispara atualização dos badges IbiZap na sidebar do portal. */
export function bumpChamadosResumoNav(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chamados-resumo-changed"));
  }
}
