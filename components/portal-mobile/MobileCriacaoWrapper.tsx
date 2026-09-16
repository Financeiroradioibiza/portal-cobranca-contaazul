"use client";

import { useEffect, useState } from "react";
import { CriacaoErrorDock } from "@/components/criacao/CriacaoErrorDock";
import {
  CriacaoLiveDiagProvider,
  useCriacaoLiveDiag,
} from "@/components/criacao/CriacaoLiveDiagContext";
import { MusicaPreviewProvider, useMusicaPreview } from "@/components/criacao/MusicaPreviewDock";

function CriacaoMobileShell({ children }: { children: React.ReactNode }) {
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

/** Preview + diagnóstico ao vivo (Master, opt-in) nas telas de Criação mobile. */
export function MobileCriacaoWrapper({ children }: { children: React.ReactNode }) {
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setIsMaster(Boolean(data?.isMaster));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CriacaoLiveDiagProvider isMaster={isMaster}>
      <MusicaPreviewProvider>
        <CriacaoMobileShell>{children}</CriacaoMobileShell>
        <CriacaoErrorDock />
      </MusicaPreviewProvider>
    </CriacaoLiveDiagProvider>
  );
}
