import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const row = await prisma.contaAzulToken.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return NextResponse.json({
        connected: false,
      });
    }
    return NextResponse.json({
      connected: true,
      expiresAt: row.expiresAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "database_error";
    return NextResponse.json(
      {
        connected: false,
        error: msg,
      },
      { status: 500 },
    );
  }
}
