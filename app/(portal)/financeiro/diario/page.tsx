import { FinanceiroDiarioPanel } from "@/components/financeiro/FinanceiroDiarioPanel";

export default function FinanceiroDiarioPage() {
  return (
    <div className="portal-page flex min-h-0 flex-col">
      <header className="portal-page-header shrink-0">
        <div>
          <div className="portal-page-crumb">Financeiro / Diário</div>
          <h1 className="portal-page-title">Diário</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registro de atendimentos do financeiro — por cliente ou PDV, com busca e histórico.
          </p>
        </div>
      </header>
      <div className="portal-page-body flex min-h-0 flex-1 flex-col">
        <FinanceiroDiarioPanel />
      </div>
    </div>
  );
}
