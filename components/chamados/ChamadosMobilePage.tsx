"use client";

import { usePathname } from "next/navigation";
import { ChamadosPwaSetup } from "@/components/chamados/ChamadosPwaSetup";
import { ChamadosPortalShell } from "@/components/chamados/ChamadosPortalShell";
import type { ChamadosWorkspaceView } from "@/components/chamados/ChamadosWorkspace";

function viewFromPath(pathname: string): ChamadosWorkspaceView {
  if (pathname.includes("/kanban")) return "kanban";
  return "conversa";
}

export function ChamadosMobilePage() {
  const pathname = usePathname();
  const view = viewFromPath(pathname);

  return (
    <>
      <ChamadosPwaSetup />
      <ChamadosPortalShell view={view} mobile />
    </>
  );
}
