"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { PortalProcessingProvider } from "@/components/portal/PortalProcessingProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <PortalProcessingProvider>{children}</PortalProcessingProvider>
    </ThemeProvider>
  );
}
