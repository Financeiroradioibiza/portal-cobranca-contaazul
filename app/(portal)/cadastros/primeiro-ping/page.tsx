import { PrimeiroPingPanel } from "@/components/cadastros/PrimeiroPingPanel";

export default function PrimeiroPingPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Cadastros / Primeiro ping</div>
          <h1 className="portal-page-title">Primeiro ping</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <PrimeiroPingPanel />
      </div>
    </div>
  );
}
