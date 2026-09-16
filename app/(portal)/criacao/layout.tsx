"use client";

import { CriacaoErrorDock } from "@/components/criacao/CriacaoErrorDock";
import { useCriacaoLiveDiag } from "@/components/criacao/CriacaoLiveDiagContext";
import { MusicaPreviewProvider, useMusicaPreview } from "@/components/criacao/MusicaPreviewDock";

function CriacaoLayoutShell({ children }: { children: React.ReactNode }) {
  const { track } = useMusicaPreview();
  const { enabled: liveDiagOn } = useCriacaoLiveDiag();
  const dockPad = liveDiagOn ? "min(46vh, 340px)" : "0px";
  const previewPad = track ? "11rem" : "0px";
  return (
    <div
      className="min-h-full"
      style={{ paddingBottom: liveDiagOn || track ? `calc(${dockPad} + ${previewPad})` : undefined }}
    >
      {children}
    </div>
  );
}

/** Espaço no rodapé para player de preview + diagnóstico ao vivo (Master, opt-in). */
export default function CriacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <MusicaPreviewProvider>
      <CriacaoLayoutShell>{children}</CriacaoLayoutShell>
      <CriacaoErrorDock />
    </MusicaPreviewProvider>
  );
}
