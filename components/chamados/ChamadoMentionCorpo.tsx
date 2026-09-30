"use client";

import type { ReactNode } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import {
  CHAMADO_MENTION_SPLIT_RE,
  normalizeParticipantTagCor,
  participantForMentionToken,
} from "@/lib/chamados/chamadoMentions";

type Props = {
  corpo: string;
  participants: ChamadoParticipant[];
  className?: string;
};

export function ChamadoMentionCorpo({ corpo, participants, className }: Props) {
  const parts = corpo.split(CHAMADO_MENTION_SPLIT_RE);
  const nodes: ReactNode[] = parts.map((p, i) => {
    if (!p.startsWith("@")) return p;
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
