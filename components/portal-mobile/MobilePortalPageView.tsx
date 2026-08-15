import type { MobilePortalPageResolved } from "@/lib/portal/mobilePageRegistry";
import { MobileCriacaoWrapper } from "@/components/portal-mobile/MobileCriacaoWrapper";

export function MobilePortalPageView({ page }: { page: MobilePortalPageResolved }) {
  const body = (
    <>
      <header className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{page.section}</div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{page.title}</h1>
        {page.description ?
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{page.description}</p>
        : null}
      </header>
      <div className="mobile-portal-panel min-w-0 overflow-x-auto">{page.content}</div>
    </>
  );

  if (page.criacao) {
    return <MobileCriacaoWrapper>{body}</MobileCriacaoWrapper>;
  }

  return body;
}
