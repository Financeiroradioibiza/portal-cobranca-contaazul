import { ChamadosBoard } from "@/components/chamados/ChamadosBoard";

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
        <ChamadosBoard />
      </div>
    </div>
  );
}
