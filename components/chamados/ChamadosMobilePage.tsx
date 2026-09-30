"use client";

import { Suspense } from "react";
import { ChamadosPwaSetup } from "@/components/chamados/ChamadosPwaSetup";
import { ChamadosWorkspace } from "@/components/chamados/ChamadosWorkspace";

export function ChamadosMobilePage() {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <ChamadosPwaSetup />
      <Suspense
        fallback={<p className="px-1 py-8 text-center text-sm text-slate-500">Carregando chamados…</p>}
      >
        <ChamadosWorkspace mobile />
      </Suspense>
    </div>
  );
}
