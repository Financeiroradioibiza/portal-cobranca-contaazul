import { SolicitarPdvPanel } from "@/components/cadastros/SolicitarPdvPanel";

type Props = { searchParams: Promise<{ id?: string; prospectId?: string }> };

export default async function SolicitarPdvPage({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Cadastros / Solicitar PDV</div>
          <h1 className="portal-page-title">Solicitar PDV</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <SolicitarPdvPanel pedidoId={sp.id} prospectId={sp.prospectId} />
      </div>
    </div>
  );
}
