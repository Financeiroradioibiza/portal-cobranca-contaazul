import { AtlCricaPanel } from "@/components/criacao/AtlCricaPanel";

export default function AtlCricaPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Criação</div>
          <h1 className="portal-page-title">ATL CRICA</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <AtlCricaPanel />
      </div>
    </div>
  );
}
