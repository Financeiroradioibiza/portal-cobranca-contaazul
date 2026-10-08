import { supabase } from './supabase.js'

const PORTAL_BOOTSTRAP_KEY = 'rb_portal_preview_auth'

export function markPortalBootstrapSession() {
  try {
    sessionStorage.setItem(PORTAL_BOOTSTRAP_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearPortalBootstrapSession() {
  try {
    sessionStorage.removeItem(PORTAL_BOOTSTRAP_KEY)
  } catch {
    /* ignore */
  }
}

function isPortalBootstrapSession() {
  try {
    return sessionStorage.getItem(PORTAL_BOOTSTRAP_KEY) === '1'
  } catch {
    return false
  }
}

/** Sessão Supabase via cookie do portal (mesma origem). */
export async function tryPortalSupabaseBootstrap() {
  try {
    const res = await fetch('/api/criacao/preview-musical/bootstrap-auth', {
      credentials: 'include',
    })
    if (!res.ok) return { ok: false, status: res.status }
    const body = await res.json()
    if (!body.access_token || !body.refresh_token) return { ok: false, status: res.status }
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    if (error) return { ok: false, error: error.message }
    markPortalBootstrapSession()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * Sessão admin permitida.
 * Portal bootstrap: não chama MFA (evita travar em AAL1 com TOTP no usuário de serviço).
 */
export async function adminSessionAllowed(session) {
  if (!session) return false
  if (isPortalBootstrapSession()) return true

  let factors
  try {
    const result = await supabase.auth.mfa.listFactors()
    if (result.error) return false
    factors = result.data
  } catch {
    return false
  }

  const hasVerifiedTotp = factors?.totp?.some((f) => f.status === 'verified')
  if (!hasVerifiedTotp) return true

  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return aal?.currentLevel === 'aal2'
  } catch {
    return false
  }
}
