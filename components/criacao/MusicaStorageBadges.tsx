import type { MusicaStorageBadge, MusicaStorageBadgeId } from "@/lib/criacao/musicaStorageBadges";

const BADGE_STYLE: Record<
  MusicaStorageBadgeId,
  { className: string }
> = {
  "b2-192": {
    className:
      "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
  },
  "b2-128": {
    className:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  },
  "b2-64": {
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  },
};

export function MusicaStorageBadges({
  badges,
  size = "default",
}: {
  badges: MusicaStorageBadge[];
  size?: "default" | "compact";
}) {
  if (badges.length === 0) return null;

  const textClass = size === "compact" ? "text-[8px] px-1 py-0" : "text-[9px] px-1.5 py-0.5";

  return (
    <span className="inline-flex flex-wrap items-center gap-0.5" aria-label="Destinos de armazenamento">
      {badges.map((b) => (
        <span
          key={b.id}
          title={b.title}
          className={`inline-flex shrink-0 rounded border font-mono font-bold uppercase tracking-tight ${textClass} ${BADGE_STYLE[b.id].className}`}
        >
          {b.label}
        </span>
      ))}
    </span>
  );
}
