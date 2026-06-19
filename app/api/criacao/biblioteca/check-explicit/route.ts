import { NextResponse } from "next/server";

/** @deprecated Use /check-explicit/apis e /check-explicit/gemini */
export async function POST() {
  return NextResponse.json(
    { error: "use_check_explicit_apis_ou_gemini" },
    { status: 410 },
  );
}
