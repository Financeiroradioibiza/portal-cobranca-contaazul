import { Suspense } from "react";
import { ClientesRelacionamentoPanel } from "@/components/clientes/ClientesRelacionamentoPanel";

export default function ClientesPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Dashboard · Relacionamento</div>
          <h1 className="portal-page-title">Clientes</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <Suspense fallback={<p className="text-sm text-slate-500">Carregando…</p>}>
          <ClientesRelacionamentoPanel />
        </Suspense>
      </div>
    </div>
  );
}
