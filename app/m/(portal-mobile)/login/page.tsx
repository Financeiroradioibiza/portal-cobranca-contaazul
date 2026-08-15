import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { redirectIfPortalSession } from "@/lib/auth/portalPageGuard";
import { PORTAL_MOBILE_BASE } from "@/lib/portal/mobilePaths";

export const metadata: Metadata = {
  title: "Login — Portal Radio Ibiza",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f172a",
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function MobilePortalLoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  if (!sp.next?.trim()) {
    redirect(`${PORTAL_MOBILE_BASE}/login?next=${encodeURIComponent(PORTAL_MOBILE_BASE)}`);
  }
  const next = sp.next.trim();
  await redirectIfPortalSession(next);

  return (
    <main className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 px-4 py-6 text-white safe-area-pb safe-area-pt">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Radio Ibiza</div>
          <h1 className="mt-1 text-2xl font-bold">Portal mobile</h1>
          <p className="mt-2 text-sm text-indigo-200/80">Acesso staff — mesma conta do portal desktop.</p>
        </div>
        <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100">
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-indigo-200/70">
          Prefere a versão completa?{" "}
          <a href="/login?desktop=1" className="font-semibold underline">
            Abrir desktop
          </a>
        </p>
      </div>
    </main>
  );
}
