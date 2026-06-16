import { FinanceiroVisaoGeralPanel } from "@/components/financeiro/FinanceiroVisaoGeralPanel";

export default function FinanceiroVisaoGeralPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Financeiro / Visão geral</div>
          <h1 className="portal-page-title">Visão geral</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <FinanceiroVisaoGeralPanel />
      </div>
    </div>
  );
}
