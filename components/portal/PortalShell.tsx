import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { PortalTopbar } from "@/components/portal/PortalTopbar";

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <PortalTopbar />
      <div className="portal-body">
        <PortalSidebar />
        <div className="portal-main">{children}</div>
      </div>
    </div>
  );
}
