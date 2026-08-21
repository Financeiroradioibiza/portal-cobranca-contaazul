import { AtendimentoRelaPanel } from "@/components/atendimento/AtendimentoRelaPanel";

export default function AtendimentoRelaPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Atendimento</div>
          <h1 className="portal-page-title">Rela</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
            Visão unificada da Planilha Rio (financeiro) e da produção musical. Alterne entre clientes
            de cobrança e clientes operacionais; na produção, abra o cadastro de cada PDV para editar.
          </p>
        </div>
      </header>
      <div className="portal-page-body">
        <AtendimentoRelaPanel />
      </div>
    </div>
  );
}
