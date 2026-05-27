import { CobrancaDashboard } from "@/components/CobrancaDashboard";

export default function Home() {
  return (
    <main className="min-h-full min-w-0 bg-[#f4f6f9] text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <CobrancaDashboard />
    </main>
  );
}
