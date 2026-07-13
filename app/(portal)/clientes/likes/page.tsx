import { Suspense } from "react";
import { LikesPanel } from "@/components/clientes/LikesPanel";

export default function ClientesLikesPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Dashboard · Relacionamento</div>
          <h1 className="portal-page-title">Likes</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <Suspense fallback={<p className="text-sm text-slate-500">Carregando…</p>}>
          <LikesPanel />
        </Suspense>
      </div>
    </div>
  );
}
