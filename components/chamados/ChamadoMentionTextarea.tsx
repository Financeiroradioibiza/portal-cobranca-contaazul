"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";
import {
  applyMentionSelection,
  filterParticipantsForMention,
  mentionInsertToken,
  parseActiveMentionQuery,
} from "@/lib/chamados/chamadoMentionAutocomplete";
import { normalizeParticipantTagCor } from "@/lib/chamados/chamadoMentions";

type MenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

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

function measureMentionMenu(ta: HTMLTextAreaElement): MenuPos {
  const rect = ta.getBoundingClientRect();
  const maxH = 208;
  const gap = 6;
  const margin = 8;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openDown = spaceBelow >= 100 || spaceBelow >= spaceAbove;
  const width = Math.max(rect.width, 260);

  if (openDown) {
    const maxHeight = Math.min(maxH, Math.max(96, spaceBelow - gap));
    return {
      top: rect.bottom + gap,
      left: Math.min(rect.left, window.innerWidth - width - margin),
      width,
      maxHeight,
    };
  }

  const maxHeight = Math.min(maxH, Math.max(96, spaceAbove - gap));
  return {
    top: Math.max(margin, rect.top - maxHeight - gap),
    left: Math.min(rect.left, window.innerWidth - width - margin),
    width,
    maxHeight,
  };
}

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
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = useMemo(() => parseActiveMentionQuery(value, cursor), [value, cursor]);

  const options = useMemo(() => {
    if (!active) return [];
    return filterParticipantsForMention(participants, active.query);
  }, [active, participants]);

  useEffect(() => {
    setOpen(Boolean(active && participants.length > 0));
    setHighlight(0);
  }, [active, participants.length]);

  const syncMenuPos = useCallback(() => {
    const el = taRef.current;
    if (!el || !open) {
      setMenuPos(null);
      return;
    }
    setMenuPos(measureMentionMenu(el));
  }, [open]);

  useLayoutEffect(() => {
    syncMenuPos();
  }, [syncMenuPos, open, options.length, value, cursor]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => syncMenuPos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, syncMenuPos]);

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

  const listbox =
    open && menuPos ?
      <div
        role="listbox"
        aria-label="Mencionar usuário"
        className="fixed z-[10050] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-600 dark:bg-slate-900"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
        }}
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
                <span className="font-bold" style={{ color: normalizeParticipantTagCor(p.tagCor) }}>
                  @{mentionInsertToken(p)}
                </span>
                {" · "}
                {p.profileName}
              </span>
            </span>
          </button>
        ))}
      </div>
    : null;

  return (
    <div className="relative">
      {mounted && listbox ? createPortal(listbox, document.body) : null}

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
