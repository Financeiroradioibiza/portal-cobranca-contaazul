import { ChamadosAgendaPanel } from "@/components/chamados/ChamadosAgendaPanel";

export default function ChamadosAgendaPage() {
  return (
    <div className="portal-page flex min-h-0 flex-1 flex-col">
      <header className="portal-page-header shrink-0">
        <div>
          <div className="portal-page-crumb">IbiZap</div>
          <h1 className="portal-page-title">Agenda</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Chamados com prazo, compromissos e sequências — mesma agenda do app mobile, otimizada para desktop.
          </p>
        </div>
      </header>
      <div className="portal-page-body flex min-h-0 flex-1 flex-col pb-4">
        <ChamadosAgendaPanel variant="page" />
      </div>
    </div>
  );
}
