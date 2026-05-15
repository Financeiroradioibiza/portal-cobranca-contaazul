import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-full bg-[#f4f6f9] text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Suspense
        fallback={
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
