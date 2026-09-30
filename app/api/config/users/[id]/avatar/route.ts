import { NextResponse } from "next/server";
import { getPortalSession, requireMasterSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { PORTAL_USER_AVATAR_MAX_BYTES } from "@/lib/config/portalUserAvatar";
import {
  clearPortalUserAvatar,
  getPortalUserAvatarFile,
  setPortalUserAvatar,
} from "@/lib/config/portalUserAvatarService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const file = await getPortalUserAvatarFile(id);
    if (!file) return new NextResponse("Sem foto.", { status: 404 });
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType);
    headers.set("Cache-Control", "private, max-age=3600");
    return new NextResponse(new Uint8Array(file.data), { status: 200, headers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/users/:id/avatar GET]", e);
    return new NextResponse("Erro ao obter foto.", { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireMasterSession();
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    if (file.size > PORTAL_USER_AVATAR_MAX_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    await setPortalUserAvatar(id, { bytes, mimeType: file.type || "image/jpeg" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "file_too_large") return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    if (msg === "mime_not_allowed") return NextResponse.json({ error: "mime_not_allowed" }, { status: 415 });
    console.error("[config/users/:id/avatar POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireMasterSession();
    const { id } = await ctx.params;
    await clearPortalUserAvatar(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/users/:id/avatar DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
