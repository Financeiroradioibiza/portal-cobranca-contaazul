import { ProspectsBoard } from "@/components/cadastros/ProspectsBoard";

export default function ProspectsPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Cadastros / Prospects</div>
          <h1 className="portal-page-title">Prospects</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <ProspectsBoard />
      </div>
    </div>
  );
}
