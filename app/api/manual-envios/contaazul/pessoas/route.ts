import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { searchPeopleByText } from "@/lib/contaazul/personBilling";

const CA_HINT_PT =
  "Não há token Conta Azul válido neste servidor. No painel principal (/), clique em «Conectar Conta Azul» neste mesmo domínio (ex.: HTTPS do Netlify); no app Conta Azul marque permissões para cadastro de pessoas. Depois atualize esta página.";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ connected: null, pessoas: [] });
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({
      connected: false,
      message: CA_HINT_PT,
      pessoas: [],
    });
  }

  try {
    const list = await searchPeopleByText(token, q.slice(0, 120));
    return NextResponse.json({
      connected: true,
      pessoas: list,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "busca_erro_ca";
    return NextResponse.json({
      connected: true,
      pessoas: [],
      caError: msg.slice(0, 480),
    });
  }
}
