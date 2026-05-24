import { NextResponse } from "next/server";
import { isOcSmtpConfigured } from "@/lib/email/ocSmtp";
import { OC_EMAIL_PLACEHOLDER_KEYS } from "@/lib/manualReminders/ocEmailRender";
import { getOrCreateOcEmailTemplate } from "@/lib/manualReminders/ocEmailTemplateService";
import { prisma } from "@/lib/prisma";

const MAX_SUBJECT = 900;
const MAX_BODY = 100_000;

export async function GET() {
  try {
    const row = await getOrCreateOcEmailTemplate();
    return NextResponse.json({
      subject: row.subject,
      bodyText: row.bodyText,
      smtpConfigured: isOcSmtpConfigured(),
      placeholders: OC_EMAIL_PLACEHOLDER_KEYS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    let body: { subject?: unknown; bodyText?: unknown };
    try {
      body = (await request.json()) as { subject?: unknown; bodyText?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    if (typeof body.subject !== "string" || typeof body.bodyText !== "string") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    const subject = body.subject.trim().slice(0, MAX_SUBJECT);
    const bodyText = body.bodyText.slice(0, MAX_BODY);
    if (!subject.length || !bodyText.trim().length) {
      return NextResponse.json({ error: "empty_template" }, { status: 400 });
    }

    await getOrCreateOcEmailTemplate();

    await prisma.ocEmailTemplate.update({
      where: { id: "default" },
      data: { subject, bodyText },
    });

    return NextResponse.json({ ok: true, smtpConfigured: isOcSmtpConfigured() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
