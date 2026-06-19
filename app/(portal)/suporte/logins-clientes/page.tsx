import { LoginsClientesPanel } from "@/components/suporte/LoginsClientesPanel";

export default function SuporteLoginsClientesPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Logins clientes</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <LoginsClientesPanel />
      </div>
    </div>
  );
}
