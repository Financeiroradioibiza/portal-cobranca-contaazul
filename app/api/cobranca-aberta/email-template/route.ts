import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateCobrancaAbertaEmailTemplate } from "@/lib/cobrancaAberta/cobrancaAbertaEmailTemplateService";
import { isOcSmtpConfigured } from "@/lib/email/ocSmtp";

export async function GET() {
  try {
    const tpl = await getOrCreateCobrancaAbertaEmailTemplate();
    return NextResponse.json({
      subject: tpl.subject,
      bodyText: tpl.bodyText,
      smtpConfigured: isOcSmtpConfigured(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_tpl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const bodyText = typeof body.bodyText === "string" ? body.bodyText : "";
  if (!subject.slice(0, 480))
    return NextResponse.json({ error: "missing_subject" }, { status: 400 });
  if (!bodyText.trim()) return NextResponse.json({ error: "missing_body" }, { status: 400 });

  try {
    const row = await prisma.cobrancaAbertaEmailTemplate.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        subject: subject.slice(0, 480),
        bodyText: bodyText.trim().slice(0, 48000),
      },
      update: {
        subject: subject.slice(0, 480),
        bodyText: bodyText.trim().slice(0, 48000),
      },
    });
    return NextResponse.json({
      ok: true,
      subject: row.subject,
      bodyText: row.bodyText,
      smtpConfigured: isOcSmtpConfigured(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_save";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
