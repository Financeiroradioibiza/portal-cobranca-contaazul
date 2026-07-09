import { Suspense } from "react";
import { UploadPanel } from "@/components/criacao/UploadPanel";

export default function CriacaoUploadPage() {
  return (
    <div className="portal-page min-h-full min-w-0">
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando upload…</div>}>
        <UploadPanel />
      </Suspense>
    </div>
  );
}
