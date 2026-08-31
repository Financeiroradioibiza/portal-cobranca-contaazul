import { MigracaoPanel } from "@/components/suporte/MigracaoPanel";

export default function SuporteMigracaoPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Migração</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <MigracaoPanel />
      </div>
    </div>
  );
}
