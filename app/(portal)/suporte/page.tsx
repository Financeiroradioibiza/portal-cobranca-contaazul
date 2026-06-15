import { ProducaoSuportePanel } from "@/components/producao/ProducaoSuportePanel";

export default function SuportePage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Central de suporte</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <ProducaoSuportePanel />
      </div>
    </div>
  );
}
