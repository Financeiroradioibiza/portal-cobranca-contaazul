"use client";

import { useMemo, useState } from "react";
import type { MusicaTagManualView } from "@/lib/criacao/bibliotecaClientTypes";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";
import { isUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";

function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1e293b" : "#ffffff";
}

type TagViewMode = "icons" | "full";

function groupKey(t: MusicaTagManualView): string {
  return t.criativoUserId || t.criativoNome || t.criativoIniciais || "?";
}

export function BibliotecaManualTagsCell({
  tags,
  mode,
  compact,
}: {
  tags: MusicaTagManualView[];
  mode: TagViewMode;
  compact?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, MusicaTagManualView[]>();
    for (const t of tags) {
      const k = groupKey(t);
      const list = map.get(k) ?? [];
      list.push(t);
      map.set(k, list);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items, head: items[0]! }));
  }, [tags]);

  if (tags.length === 0) {
    return <span className="truncate text-[11px] text-slate-400">—</span>;
  }

  if (mode === "full") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 overflow-hidden">
        {tags.map((t) => (
          <span
            key={t.id}
            className={
              "inline-flex max-w-full items-center gap-0.5 truncate rounded font-bold " +
              (isUploadCompetenciaTag(t.nome) ?
                "px-1 py-0 text-[7px] opacity-90"
              : compact ?
                "px-1.5 py-0 text-[9px]"
              : "px-2 py-0.5 text-[10px]")
            }
            style={{ background: t.cor, color: readableText(t.cor) }}
            title={t.criativoNome ? `${t.criativoNome} · ${t.nome}` : t.nome}
          >
            <PortalUserAvatar
              userId={t.criativoPortalUserId}
              displayName={t.criativoNome || t.nome}
              email={t.criativoUserId ?? t.criativoNome}
              hasAvatar={t.criativoHasAvatar}
              avatarVersion={t.criativoAvatarVersion}
              size="xs"
              className="h-3.5 w-3.5 shrink-0"
            />
            {t.nome}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5">
      {groups.map(({ key, items, head }) => {
        const open = openKey === key;
        return (
          <span key={key} className="relative inline-flex">
            <button
              type="button"
              className="rounded-full p-[2px] ring-1 ring-slate-200/80 transition hover:ring-violet-400 dark:ring-slate-600"
              style={{ backgroundColor: head.cor || "#64748b" }}
              title={
                items.map((t) => (t.criativoNome ? `${t.criativoNome}: ${t.nome}` : t.nome)).join(" · ") ||
                head.criativoNome
              }
              onMouseEnter={() => setOpenKey(key)}
              onMouseLeave={() => setOpenKey((k) => (k === key ? null : k))}
              onClick={(e) => {
                e.stopPropagation();
                setOpenKey((k) => (k === key ? null : key));
              }}
            >
              <PortalUserAvatar
                userId={head.criativoPortalUserId}
                displayName={head.criativoNome || head.nome}
                email={head.criativoUserId ?? head.criativoNome}
                hasAvatar={head.criativoHasAvatar}
                avatarVersion={head.criativoAvatarVersion}
                size="xs"
                className="h-6 w-6"
              />
            </button>
            {open ?
              <span
                className="absolute left-0 top-full z-30 mt-1 flex max-w-[min(240px,70vw)] flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                onMouseEnter={() => setOpenKey(key)}
                onMouseLeave={() => setOpenKey(null)}
              >
                {items.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: t.cor, color: readableText(t.cor) }}
                  >
                    {t.nome}
                  </span>
                ))}
              </span>
            : null}
          </span>
        );
      })}
    </div>
  );
}
