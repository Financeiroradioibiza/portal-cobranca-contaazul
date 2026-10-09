import { MicrosoftStoreInstalacaoPanel } from "@/components/suporte/MicrosoftStoreInstalacaoPanel";

export default function SuporteInstalacaoMicrosoftStorePage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Suporte</div>
          <h1 className="portal-page-title">Instalação · Microsoft Store</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <MicrosoftStoreInstalacaoPanel />
      </div>
    </div>
  );
}
