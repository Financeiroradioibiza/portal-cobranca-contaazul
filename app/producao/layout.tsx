import { ProducaoAreaNav } from "@/components/portal/ProducaoAreaNav";

export default function ProducaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full min-w-0 flex-col bg-[#f4f6f9] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ProducaoAreaNav />
      {children}
    </div>
  );
}
