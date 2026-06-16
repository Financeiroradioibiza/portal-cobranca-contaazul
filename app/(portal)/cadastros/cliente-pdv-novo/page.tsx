import { PedidoClientePdvPanel } from "@/components/cadastros/PedidoClientePdvPanel";

type Props = { searchParams: Promise<{ id?: string; prospectId?: string }> };

export default async function ClientePdvNovoPage({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Cadastros / Cliente · PDV novo</div>
          <h1 className="portal-page-title">Cliente / PDV novo</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <PedidoClientePdvPanel pedidoId={sp.id} prospectId={sp.prospectId} />
      </div>
    </div>
  );
}
