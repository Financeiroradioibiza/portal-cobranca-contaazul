"use client";

import type { ReactNode } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import {
  CHAMADO_MENTION_SPLIT_RE,
  normalizeParticipantTagCor,
  participantForMentionToken,
} from "@/lib/chamados/chamadoMentions";
import { splitCorpoRichText } from "@/lib/chamados/corpoRichText";

type Props = {
  corpo: string;
  participants: ChamadoParticipant[];
  className?: string;
};

function renderPlainWithLinks(text: string, keyPrefix: string): ReactNode[] {
  const segs = splitCorpoRichText(text);
  return segs.map((s, i) => {
    const key = `${keyPrefix}-${i}`;
    if (s.kind === "text") return s.value;
    if (s.kind === "url") {
      return (
        <a
          key={key}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-400"
        >
          {s.label}
        </a>
      );
    }
    return (
      <a
        key={key}
        href={s.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-400"
        title="Abrir WhatsApp"
      >
        {s.label}
      </a>
    );
  });
}

export function ChamadoMentionCorpo({ corpo, participants, className }: Props) {
  const parts = corpo.split(CHAMADO_MENTION_SPLIT_RE);
  const nodes: ReactNode[] = parts.map((p, i) => {
    if (!p.startsWith("@")) return <span key={i}>{renderPlainWithLinks(p, `t${i}`)}</span>;
    const person = participantForMentionToken(p, participants);
    const color = normalizeParticipantTagCor(person?.tagCor);
    return (
      <span key={i} className="font-bold" style={{ color }}>
        {p}
      </span>
    );
  });
  return <span className={className}>{nodes}</span>;
}
