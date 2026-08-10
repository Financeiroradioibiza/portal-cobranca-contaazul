export type PdvPlayStatus = "online" | "hoje" | "offline" | "sem_install";

const TZ = "America/Sao_Paulo";
const ONLINE_MS = 2 * 60 * 60 * 1000;

function brDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function computePdvPlayStatus(
  firstPingAt: string | null | undefined,
  lastPingAt: string | null | undefined,
  now = new Date(),
): PdvPlayStatus {
  if (!lastPingAt?.trim()) {
    if (!firstPingAt?.trim()) return "sem_install";
    return "offline";
  }
  const last = new Date(lastPingAt);
  if (Number.isNaN(last.getTime())) return "sem_install";

  const diffMs = now.getTime() - last.getTime();
  if (diffMs <= ONLINE_MS) return "online";

  if (brDateKey(last) === brDateKey(now)) return "hoje";
  return "offline";
}

export const PDV_STATUS_META: Record<
  PdvPlayStatus,
  { label: string; className: string }
> = {
  online: {
    label: "ONLINE",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300",
  },
  hoje: {
    label: "HOJE",
    className: "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/40 dark:text-amber-200",
  },
  offline: {
    label: "OFFLINE",
    className: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/40 dark:text-rose-300",
  },
  sem_install: {
    label: "SEM INSTALL",
    className: "bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/40 dark:text-violet-300",
  },
};
