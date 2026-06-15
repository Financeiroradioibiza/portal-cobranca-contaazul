"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRODUCAO_NAV } from "@/lib/portal/producaoNav";
import { PortalModuleLinks } from "@/components/portal/PortalModuleLinks";
import { ThemeToggle } from "@/components/ThemeToggle";

export function ProducaoAreaNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95"
      aria-label="Produção"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <span className="me-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-400">
          Produção
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {PRODUCAO_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm " +
                  (active ?
                    "bg-fuchsia-700 text-white dark:bg-fuchsia-600"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800")
                }
              >
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.short}</span>
              </Link>
            );
          })}
        </div>
        <PortalModuleLinks />
        <ThemeToggle />
      </div>
    </nav>
  );
}
