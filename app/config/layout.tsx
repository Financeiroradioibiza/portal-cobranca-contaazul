import { ConfigAreaNav } from "@/components/portal/ConfigAreaNav";

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full min-w-0 flex-col bg-[#f4f6f9] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ConfigAreaNav />
      {children}
    </div>
  );
}
