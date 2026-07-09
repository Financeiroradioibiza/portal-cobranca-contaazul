import { ServidorUpPanel } from "@/components/criacao/ServidorUpPanel";

export default function ServidorUpPage() {
  return (
    <div className="portal-page min-h-full min-w-0">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Criação</div>
          <h1 className="portal-page-title">Servidor UP</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <ServidorUpPanel />
      </div>
    </div>
  );
}
