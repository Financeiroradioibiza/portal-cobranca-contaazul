import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  previewServidorUpHierarchy,
  type ServidorUpFileInput,
} from "@/lib/criacao/servidorUpHierarchyService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { files?: ServidorUpFileInput[] };
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) {
      return NextResponse.json({ error: "files_obrigatorio" }, { status: 400 });
    }
    const preview = await previewServidorUpHierarchy(files.slice(0, 50_000));
    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/hierarchy-preview POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
