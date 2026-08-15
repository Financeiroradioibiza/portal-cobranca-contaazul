export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveMobilePortalPage, desktopPathFromSegments } from "@/lib/portal/mobilePageRegistry";
import { MobilePortalPageView } from "@/components/portal-mobile/MobilePortalPageView";
import { toMobilePortalPath } from "@/lib/portal/mobilePaths";

type Props = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MobilePortalCatchAllPage({ params, searchParams }: Props) {
  const { segments } = await params;
  const sp = await searchParams;
  const desktopPath = desktopPathFromSegments(segments);

  if (desktopPath === "/cadastros/cliente-pdv-novo") {
    const qs = new URLSearchParams();
    const id = sp.id;
    const prospectId = sp.prospectId;
    if (typeof id === "string") qs.set("id", id);
    if (typeof prospectId === "string") qs.set("prospectId", prospectId);
    const suffix = qs.toString();
    redirect(toMobilePortalPath(suffix ? `/cadastros/solicitar-pdv?${suffix}` : "/cadastros/solicitar-pdv"));
  }

  const page = resolveMobilePortalPage(segments);

  if (!page) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">Esta rota ainda não está disponível na versão mobile.</p>
        <Link href="/m" className="mt-4 inline-block text-sm font-semibold text-orange-600">
          Voltar ao início
        </Link>
      </div>
    );
  }

  return <MobilePortalPageView page={page} />;
}
