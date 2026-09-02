import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  countExplicitoScope,
  type ExplicitoScanScope,
} from "@/lib/criacao/explicitoScanService";
import { geniusEnabled } from "@/lib/criacao/geniusLyricsService";

function parseScopeFromSearch(params: URLSearchParams): ExplicitoScanScope {
  const kind = params.get("kind") ?? "all";
  if (kind === "tag") {
    const tagId = params.get("tagId")?.trim();
    if (tagId) return { kind: "tag", tagId };
  }
  if (kind === "custom") {
    const bibliotecaPastaId = params.get("bibliotecaPastaId")?.trim();
    if (bibliotecaPastaId) return { kind: "custom", bibliotecaPastaId };
  }
  if (kind === "prog") {
    const pastaProgramacaoId = params.get("pastaProgramacaoId")?.trim();
    if (pastaProgramacaoId) return { kind: "prog", pastaProgramacaoId };
  }
  if (kind === "programacao") {
    const programacaoId = params.get("programacaoId")?.trim();
    if (programacaoId) return { kind: "programacao", programacaoId };
  }
  return { kind: "all" };
}

/** Contagem de faixas no escopo (total / verificadas / pendentes). */
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const scope = parseScopeFromSearch(new URL(request.url).searchParams);
    const counts = await countExplicitoScope(scope);
    return NextResponse.json({
      ...counts,
      geniusEnabled: geniusEnabled(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/explicito/stats GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
