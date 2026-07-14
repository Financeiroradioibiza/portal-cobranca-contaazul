import { Suspense } from "react";
import { MusicBoardPanel } from "@/components/musicboard/MusicBoardPanel";

export default function MusicBoardPage() {
  return (
    <div className="portal-page">
      <header className="portal-page-header">
        <div>
          <div className="portal-page-crumb">Dashboard · Relacionamento</div>
          <h1 className="portal-page-title">MusicBoard</h1>
        </div>
      </header>
      <div className="portal-page-body">
        <Suspense fallback={<p className="text-sm text-slate-500">Carregando…</p>}>
          <MusicBoardPanel />
        </Suspense>
      </div>
    </div>
  );
}
