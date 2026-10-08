import { supabase } from './supabase.js'

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
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** MFA só bloqueia quem tem TOTP verificado; conta de serviço do portal pode ficar só em AAL1. */
export async function adminSessionAllowed(session) {
  if (!session) return false
  const { data: factors, error } = await supabase.auth.mfa.listFactors()
  if (error) return false
  const hasVerifiedTotp = factors?.totp?.some((f) => f.status === 'verified')
  if (!hasVerifiedTotp) return true
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return aal?.currentLevel === 'aal2'
}
