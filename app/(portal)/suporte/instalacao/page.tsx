import { InstalacaoPanel } from "@/components/suporte/InstalacaoPanel";

export default function SuporteInstalacaoPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Instalação</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <InstalacaoPanel />
      </div>
    </div>
  );
}
