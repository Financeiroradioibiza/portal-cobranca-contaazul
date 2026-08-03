import { EnviosManuaisEmbedPanel } from "@/components/financeiro/EnviosManuaisEmbedPanel";

export default function FinanceiroEnviosManuaisPage() {
  return (
    <div className="portal-page flex min-h-0 flex-col">
      <header className="portal-page-header shrink-0">
        <div>
          <div className="portal-page-crumb">Financeiro / Envios manuais</div>
          <h1 className="portal-page-title">Envios manuais</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cronograma de e-mails com boleto e nota fiscal (Conta Azul).
          </p>
        </div>
      </header>
      <div className="portal-page-body flex min-h-0 flex-1 flex-col">
        <EnviosManuaisEmbedPanel />
      </div>
    </div>
  );
}
