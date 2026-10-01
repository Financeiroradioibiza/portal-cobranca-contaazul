export function ConversaUnreadBadges({
  general,
  mention,
}: {
  general: number;
  mention: number;
}) {
  if (general <= 0 && mention <= 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {general > 0 ?
        <span
          className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-sky-600 px-1 py-0.5 text-[10px] font-bold text-white"
          title="Mensagens não lidas"
        >
          {general > 99 ? "99+" : general}
        </span>
      : null}
      {mention > 0 ?
        <span
          className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1 py-0.5 text-[10px] font-bold text-white"
          title="Menções (@) não lidas"
        >
          {mention > 99 ? "99+" : mention}
        </span>
      : null}
    </span>
  );
}
