import { VinhetasPanel } from "@/components/criacao/VinhetasPanel";

export default function VinhetasPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Criação</div>
          <h1 className="portal-page-title">Vinhetas</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <VinhetasPanel />
      </div>
    </div>
  );
}
