import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { searchPeopleByText } from "@/lib/contaazul/personBilling";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ pessoas: [] });
  }
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "conta_azul_not_connected", pessoas: [] }, { status: 401 });
  }

  try {
    const list = await searchPeopleByText(token, q.slice(0, 120));
    return NextResponse.json({ pessoas: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "busca_erro";
    return NextResponse.json({ error: msg, pessoas: [] }, { status: 502 });
  }
}
