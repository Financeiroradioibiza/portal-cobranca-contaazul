"use client";

/** App Vite em /preview-musical/ — mesma UI do preview.radioibiza.com.br (fase 1: embed). */
export function PreviewMusicalPanel() {
  return (
    <div className="-mx-3 flex min-h-[calc(100dvh-11rem)] flex-col sm:-mx-4 lg:-mx-2">
      <p className="mb-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
        Preview de identidade musical (admin Supabase). Links públicos do player:{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">/preview-musical/player/CÓDIGO</code>
        — amarração a cliente PDV da produção virá depois.
      </p>
      <iframe
        title="Preview musical Radio Ibiza"
        src="/preview-musical/admin"
        className="min-h-[calc(100dvh-13rem)] w-full flex-1 rounded-lg border border-slate-200 bg-[#fffaf0] dark:border-slate-700"
        allow="fullscreen"
      />
    </div>
  );
}
