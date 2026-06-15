import { PlayerAvisosPanel } from "@/components/suporte/PlayerAvisosPanel";

export default function SuporteAvisosPlayerPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Avisos player</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <PlayerAvisosPanel />
      </div>
    </div>
  );
}
