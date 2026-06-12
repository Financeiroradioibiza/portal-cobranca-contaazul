"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CADASTROS_NAV } from "@/lib/portal/cadastrosNav";
import { ThemeToggle } from "@/components/ThemeToggle";

export function CadastrosAreaNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95"
      aria-label="Cadastros"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <span className="me-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Cadastros
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {CADASTROS_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm " +
                  (active ?
                    "bg-violet-700 text-white dark:bg-violet-600"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800")
                }
              >
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.short}</span>
              </Link>
            );
          })}
        </div>
        <Link
          href="/producao/dashboard"
          className="rounded-md px-2 py-1 text-[11px] font-medium text-fuchsia-700 hover:bg-fuchsia-50 dark:text-fuchsia-300 dark:hover:bg-fuchsia-950/50"
        >
          Produção
        </Link>
        <Link
          href="/cobranca/planilha-rio"
          className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cobrança
        </Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
