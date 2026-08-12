import { ToInstaladoPanel } from "@/components/suporte/ToInstaladoPanel";

export default function SuporteToInstaladoPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Tô Instalado</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <ToInstaladoPanel />
      </div>
    </div>
  );
}
