import { PortalSessionRoot } from "@/components/portal/PortalSessionRoot";

export function PortalShell({ children }: { children: React.ReactNode }) {
  return <PortalSessionRoot>{children}</PortalSessionRoot>;
}
