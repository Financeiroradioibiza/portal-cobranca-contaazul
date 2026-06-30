import { ProducaoDashboardPanel } from "@/components/producao/ProducaoDashboardPanel";

export default function PortalHomePage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Dashboard</div>
          <h1 className="portal-page-title">Dashboard</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <ProducaoDashboardPanel />
      </div>
    </div>
  );
}
