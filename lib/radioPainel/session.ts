import { getSetCookieList, mergeCookieHeader } from "./cookies";

function absolutizeRedirect(location: string, base: string): string {
  if (location.startsWith("http")) {
    /** Cloudflare/redireções antigas costumam devolver http:// mesmo com base HTTPS */
    if (base.startsWith("https:") && /^http:\/\//i.test(location)) {
      return location.replace(/^http:\/\//i, "https://");
    }
    return location;
  }
  const path = location.startsWith("/") ? location : `/${location}`;
  return `${base}${path}`;
}

const DEFAULT_BASE = "https://painel.radioibiza.com.br";

function baseUrl(): string {
  const raw =
    process.env.RADIO_PAINEL_BASE_URL?.trim() ||
    DEFAULT_BASE;
  return raw.replace(/\/$/, "");
}

/**
 * Obtém Cookie autenticado: prioriza sessão configurada ou faz login CakePHP (/adm/users/login).
 */
export async function getPainelSessionCookie(): Promise<{
  cookie: string;
  base: string;
}> {
  const base = baseUrl();

  const prebaked =
    process.env.RADIO_PAINEL_SESSION_COOKIE?.trim() ||
    process.env.RADIO_PAINEL_COOKIE?.trim();
  if (prebaked) {
    return { cookie: prebaked, base };
  }

  const email = process.env.RADIO_PAINEL_EMAIL?.trim()
    ?? process.env.RADIO_PAINEL_LOGIN?.trim()
    ?? process.env.RADIO_PAINEL_USER?.trim()
    ?? "";
  const password = process.env.RADIO_PAINEL_PASSWORD?.trim() ?? "";

  if (!email || !password) {
    throw new Error(
      "Painel não configurado: defina RADIO_PAINEL_SESSION_COOKIE ou RADIO_PAINEL_EMAIL + RADIO_PAINEL_PASSWORD",
    );
  }

  /** Passo inicial: garantir jar CAKEPHP */
  let cookie = "";
  const first = await fetch(`${base}/adm/users/login`, {
    redirect: "manual",
    headers: { Accept: "text/html" },
    cache: "no-store",
  });
  cookie = mergeCookieHeader(cookie, getSetCookieList(first));

  const body = new URLSearchParams({
    "data[User][email]": email,
    "data[User][password]": password,
  });

  let next = await fetch(`${base}/adm/users/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookie,
      Referer: `${base}/adm/users/login`,
      Origin: base,
    },
    body,
    cache: "no-store",
  });

  cookie = mergeCookieHeader(cookie, getSetCookieList(next));

  /** Segue até 302 deixar de apontar para login (simples anti-loop) */
  for (let i = 0; i < 6; i++) {
    const code = next.status;
    if (code !== 302 && code !== 301 && code !== 303 && code !== 307 && code !== 308) {
      break;
    }
    const location = next.headers.get("location");
    if (!location || /\/adm\/users\/login/i.test(location)) {
      break;
    }
    const url = absolutizeRedirect(location, base);
    next = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "text/html", Cookie: cookie, Referer: `${base}/` },
      cache: "no-store",
    });
    cookie = mergeCookieHeader(cookie, getSetCookieList(next));
  }

  /** Valida sessão contra página interna típica */
  const probe = await fetch(`${base}/adm/clientes`, {
    redirect: "manual",
    headers: { Accept: "text/html", Cookie: cookie },
    cache: "no-store",
  });

  cookie = mergeCookieHeader(cookie, getSetCookieList(probe));
  const pLoc = probe.headers.get("location");
  if (
    probe.status === 302 &&
    pLoc &&
    /\/adm\/users\/login/i.test(pLoc)
  ) {
    throw new Error(
      "Falha de login no painel (credenciais inválidas ou bloqueio).",
    );
  }

  return { cookie, base };
}

/** GET HTML autenticado */
export async function painelHtml(
  cookie: string,
  base: string,
  pathWithQuery: string,
): Promise<string> {
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const res = await fetch(`${base}${path}`, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Cookie: cookie,
      Referer: `${base}/`,
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (res.ok && /<body[^>]+id=["']t_login["']/i.test(text)) {
    throw new Error(
      "Sessão expirada ou usuário não autenticado no painel (redirecionou ao login no HTML).",
    );
  }
  if (!res.ok) {
    throw new Error(`Painel HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  return text;
}
