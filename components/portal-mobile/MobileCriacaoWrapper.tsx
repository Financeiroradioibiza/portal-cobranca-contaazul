"use client";

import { CriacaoErrorDock } from "@/components/criacao/CriacaoErrorDock";
import { MusicaPreviewProvider, useMusicaPreview } from "@/components/criacao/MusicaPreviewDock";

function CriacaoMobileShell({ children }: { children: React.ReactNode }) {
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

/** Preview + diagnóstico fixo nas telas de Criação (espelha layout desktop). */
export function MobileCriacaoWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MusicaPreviewProvider>
      <CriacaoMobileShell>{children}</CriacaoMobileShell>
      <CriacaoErrorDock />
    </MusicaPreviewProvider>
  );
}
