import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyPortalSessionToken } from "@/lib/auth/sessionToken";
import { verifyPortalPasswordReauth } from "@/lib/auth/verifyPortalPasswordReauth";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { ensureMonthSnapshot, listMonths } from "@/lib/manualReminders/monthService";

type Ctx = { params: Promise<{ ym: string }> };

export async function GET(_req: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }
  try {
    const month = await ensureMonthSnapshot(prisma, ym);
    return NextResponse.json({
      month: {
        id: month.id,
        yearMonth: month.yearMonth,
        linhas: month.linhas,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Remove a competência (mês civíl) inteira deste painel OC: todas as linhas e anexos
 * são apagados (cascade da Prisma sobre `manual_reminder_month`). Pedimos a sua **senha
 * de login no portal** (bcrypt igual ao uso em `/login`).
 *
 * Body JSON: `{ "password": string }`
 */
export async function DELETE(req: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let body: { password?: unknown };
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "expected_json_password" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";

  const jar = await cookies();
  const cookieRaw = jar.get(PORTAL_SESSION_COOKIE)?.value;
  const session = await verifyPortalSessionToken(cookieRaw);

  const passOk = await verifyPortalPasswordReauth(password, session?.email ?? null);
  if (!passOk) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "invalid_password" }, { status: 403 });
  }

  try {
    await prisma.manualReminderMonth.delete({
      where: { yearMonth: ym },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const months = await listMonths(prisma);
    return NextResponse.json({ ok: true as const, deletedYearMonth: ym, months });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg, ok: false as const }, { status: 500 });
  }
}
