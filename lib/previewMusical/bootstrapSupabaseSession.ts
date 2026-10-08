/** Credenciais do Supabase (mesmo projeto do preview musical). */
export function previewMusicalSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = (process.env.PREVIEW_MUSICAL_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = (
    process.env.PREVIEW_MUSICAL_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ""
  ).trim();
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

export function previewMusicalAdminCredentials(): { email: string; password: string } | null {
  const email = (process.env.PREVIEW_MUSICAL_SUPABASE_ADMIN_EMAIL ?? "").trim();
  const password = process.env.PREVIEW_MUSICAL_SUPABASE_ADMIN_PASSWORD ?? "";
  if (!email || !password) return null;
  return { email, password };
}

export type PreviewMusicalSupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

/** Login password grant no Supabase Auth (servidor — usuário interno sem MFA). */
export async function fetchPreviewMusicalSupabaseSession(): Promise<PreviewMusicalSupabaseSession> {
  const cfg = previewMusicalSupabaseConfig();
  const admin = previewMusicalAdminCredentials();
  if (!cfg) throw new Error("preview_musical_supabase_not_configured");
  if (!admin) throw new Error("preview_musical_admin_not_configured");

  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: cfg.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  });

  const body = (await res.json()) as PreviewMusicalSupabaseSession & {
    error?: string;
    error_description?: string;
    msg?: string;
  };

  if (!res.ok) {
    const msg = body.error_description ?? body.msg ?? body.error ?? res.statusText;
    throw new Error(`supabase_auth_failed: ${msg}`);
  }

  if (!body.access_token || !body.refresh_token) {
    throw new Error("supabase_auth_incomplete");
  }

  return body;
}
