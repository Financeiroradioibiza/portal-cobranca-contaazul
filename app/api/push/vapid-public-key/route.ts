import { NextResponse } from "next/server";
import { getVapidConfig } from "@/lib/push/vapid";

export async function GET() {
  const vapid = getVapidConfig();
  if (!vapid) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey: vapid.publicKey });
}
