"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type PortalTheme = "light" | "dark" | "ibiza";

function normalizeTheme(theme: string | undefined): PortalTheme {
  if (theme === "dark" || theme === "ibiza") return theme;
  return "light";
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <div
        className="h-9 w-[17rem] max-w-[100%] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700"
        aria-hidden
      />
    );
  }

  const active = normalizeTheme(theme);

  const baseBtn =
    "rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3";
  const idleBtn =
    "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200";

  return (
    <div
      className="inline-flex max-w-full rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-600 dark:bg-slate-800 ibiza:border-fuchsia-900/50 ibiza:bg-[#2a1038]"
      role="group"
      aria-label="Tema da interface"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={
          active === "light"
            ? `${baseBtn} bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100`
            : `${baseBtn} ${idleBtn}`
        }
      >
        Diurno
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={
          active === "dark"
            ? `${baseBtn} bg-slate-900 font-semibold text-white shadow-sm dark:bg-slate-600`
            : `${baseBtn} ${idleBtn}`
        }
      >
        Noturno
      </button>
      <button
        type="button"
        onClick={() => setTheme("ibiza")}
        className={
          active === "ibiza"
            ? `${baseBtn} bg-gradient-to-r from-fuchsia-700 via-pink-600 to-orange-500 font-semibold text-white shadow-sm`
            : `${baseBtn} ${idleBtn} ibiza:text-fuchsia-200 ibiza:hover:text-white`
        }
      >
        Ibiza
      </button>
    </div>
  );
}
