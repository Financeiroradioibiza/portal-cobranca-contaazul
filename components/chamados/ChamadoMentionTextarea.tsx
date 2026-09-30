"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";
import {
  applyMentionSelection,
  filterParticipantsForMention,
  mentionInsertToken,
  parseActiveMentionQuery,
} from "@/lib/chamados/chamadoMentionAutocomplete";

type Props = {
  value: string;
  onChange: (value: string) => void;
  participants: ChamadoParticipant[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  onEnterSubmit?: () => void;
};

export function ChamadoMentionTextarea({
  value,
  onChange,
  participants,
  placeholder,
  rows = 2,
  disabled,
  className,
  onEnterSubmit,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const active = useMemo(() => parseActiveMentionQuery(value, cursor), [value, cursor]);

  const options = useMemo(() => {
    if (!active) return [];
    return filterParticipantsForMention(participants, active.query);
  }, [active, participants]);

  useEffect(() => {
    setOpen(Boolean(active && participants.length > 0));
    setHighlight(0);
  }, [active, participants.length]);

  const pick = useCallback(
    (p: ChamadoParticipant) => {
      if (!active) return;
      const token = mentionInsertToken(p);
      const { nextText, nextCursor } = applyMentionSelection(value, cursor, active.atIndex, token);
      onChange(nextText);
      setOpen(false);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
        setCursor(nextCursor);
      });
    },
    [active, cursor, onChange, value],
  );

  function syncCursor() {
    const el = taRef.current;
    if (el) setCursor(el.selectionStart ?? value.length);
  }

  return (
    <div className="relative">
      {open ?
        <div
          ref={listRef}
          role="listbox"
          aria-label="Mencionar usuário"
          className="absolute bottom-full left-0 z-20 mb-1 max-h-52 w-full min-w-[240px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
        >
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Mencionar {active?.query ? `· “${active.query}”` : "· todos"}
          </p>
          {options.length === 0 ?
            <p className="px-3 py-2 text-xs text-slate-500">Nenhum usuário com esse filtro.</p>
          : null}
          {options.map((p, i) => (
            <button
              key={p.email}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition " +
                (i === highlight ?
                  "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100"
                : "hover:bg-slate-50 dark:hover:bg-slate-800")
              }
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <PortalUserAvatar
                userId={p.userId}
                displayName={p.displayName}
                email={p.email}
                hasAvatar={p.hasAvatar}
                avatarVersion={p.avatarVersion}
                size="xs"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">
                  {p.displayName}
                </span>
                <span className="block truncate text-[10px] text-slate-400">
                  @{mentionInsertToken(p)} · {p.profileName}
                </span>
              </span>
            </button>
          ))}
        </div>
      : null}

      <textarea
        ref={taRef}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onClick={syncCursor}
        onKeyUp={syncCursor}
        onSelect={syncCursor}
        onChange={(e) => {
          onChange(e.target.value);
          setCursor(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (open && options.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % options.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + options.length) % options.length);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              pick(options[highlight]!);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey && onEnterSubmit) {
            e.preventDefault();
            onEnterSubmit();
          }
        }}
      />
    </div>
  );
}
