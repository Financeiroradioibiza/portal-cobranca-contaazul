import { NextResponse } from "next/server";

/** @deprecated Use /check-explicit/gemini */
export async function POST() {
  return NextResponse.json(
    { error: "use_check_explicit_gemini" },
    { status: 410 },
  );
}
