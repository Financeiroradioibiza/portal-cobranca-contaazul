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

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <div
        className="h-9 w-[11.5rem] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700"
        aria-hidden
      />
    );
  }

  const active = theme === "dark" ? "dark" : "light";

  return (
    <div
      className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-600 dark:bg-slate-800"
      role="group"
      aria-label="Tema da interface"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={
          active === "light"
            ? "rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
            : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
        }
      >
        Diurno
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={
          active === "dark"
            ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm dark:bg-slate-600"
            : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
        }
      >
        Noturno
      </button>
    </div>
  );
}
