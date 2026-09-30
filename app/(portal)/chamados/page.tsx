import { Suspense } from "react";
import { ChamadosWorkspace } from "@/components/chamados/ChamadosWorkspace";

export default function ChamadosPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Chamados</div>
          <h1 className="portal-page-title">Comunicação interna</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <Suspense fallback={<p className="text-sm text-slate-500">Carregando chamados…</p>}>
          <ChamadosWorkspace />
        </Suspense>
      </div>
    </div>
  );
}
