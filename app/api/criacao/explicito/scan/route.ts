import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  EXPLICITO_SCAN_BATCH_DEFAULT,
  EXPLICITO_SCAN_BATCH_MAX,
  scanExplicitoBatch,
  type ExplicitoScanScope,
} from "@/lib/criacao/explicitoScanService";

export const maxDuration = 60;

type Body = {
  scope?: ExplicitoScanScope;
  limit?: number;
  onlyMissing?: boolean;
  musicaIds?: string[];
};

function parseScope(raw: unknown): ExplicitoScanScope | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind === "all") return { kind: "all" };
  if (kind === "tag" && typeof o.tagId === "string" && o.tagId.trim()) {
    return { kind: "tag", tagId: o.tagId.trim() };
  }
  if (kind === "custom" && typeof o.bibliotecaPastaId === "string" && o.bibliotecaPastaId.trim()) {
    return { kind: "custom", bibliotecaPastaId: o.bibliotecaPastaId.trim() };
  }
  if (kind === "prog" && typeof o.pastaProgramacaoId === "string" && o.pastaProgramacaoId.trim()) {
    return { kind: "prog", pastaProgramacaoId: o.pastaProgramacaoId.trim() };
  }
  if (kind === "programacao" && typeof o.programacaoId === "string" && o.programacaoId.trim()) {
    return { kind: "programacao", programacaoId: o.programacaoId.trim() };
  }
  return null;
}

/** Varredura em lote — Genius + filtro local PT-BR. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as Body;
    const scope = parseScope(body.scope) ?? { kind: "all" };
    const limit = Math.min(
      EXPLICITO_SCAN_BATCH_MAX,
      Math.max(1, Number(body.limit) || EXPLICITO_SCAN_BATCH_DEFAULT),
    );
    const onlyMissing = body.onlyMissing !== false;
    const musicaIds = Array.isArray(body.musicaIds) ? body.musicaIds.filter(Boolean) : undefined;

    const result = await scanExplicitoBatch({ scope, limit, onlyMissing, musicaIds });

    if (!result.geniusEnabled) {
      return NextResponse.json({ error: "genius_desabilitado" }, { status: 503 });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/explicito/scan POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
