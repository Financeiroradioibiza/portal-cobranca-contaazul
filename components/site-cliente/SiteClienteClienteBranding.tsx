import { RadioIbizaWordmark } from "@/components/site-cliente/RadioIbizaWordmark";
import type { ReactNode } from "react";

type Props = {
  clienteNome: string;
  logoUrl: string | null;
  documento?: string | null;
  compact?: boolean;
  moodboardSlot?: ReactNode;
};

export function SiteClienteClienteBranding({
  clienteNome,
  logoUrl,
  documento,
  compact = false,
  moodboardSlot,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`Logo ${clienteNome}`}
            className={`shrink-0 rounded-lg bg-white/10 object-contain ${
              compact ? "h-10 max-w-[88px]" : "h-12 max-w-[120px]"
            }`}
          />
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className={`font-bold ${compact ? "text-lg" : "text-xl"}`}>{clienteNome}</h2>
            <span className="text-xs text-white/45">by</span>
            <RadioIbizaWordmark size={compact ? "sm" : "md"} />
          </div>
          {documento ? <p className="text-sm text-white/60">{documento}</p> : null}
        </div>
      </div>
      {moodboardSlot}
    </div>
  );
}
