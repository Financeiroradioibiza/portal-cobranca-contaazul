"use client";

import { CriacaoErrorDock } from "@/components/criacao/CriacaoErrorDock";
import { MusicaPreviewProvider, useMusicaPreview } from "@/components/criacao/MusicaPreviewDock";

function CriacaoLayoutShell({ children }: { children: React.ReactNode }) {
  const { track } = useMusicaPreview();
  return (
    <div
      className={
        track ?
          "min-h-full pb-[calc(min(46vh,340px)+11rem)]"
        : "min-h-full pb-[min(46vh,340px)]"
      }
    >
      {children}
    </div>
  );
}

/** Espaço no rodapé para player de preview + painel de diagnóstico fixo. */
export default function CriacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <MusicaPreviewProvider>
      <CriacaoLayoutShell>{children}</CriacaoLayoutShell>
      <CriacaoErrorDock />
    </MusicaPreviewProvider>
  );
}
