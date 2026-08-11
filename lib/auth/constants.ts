export const PORTAL_SESSION_COOKIE = "portal_session";

/** Duração da sessão (segundos). */
export const PORTAL_SESSION_MAX_AGE = 60 * 60 * 8;

/** Repassados pelo middleware após validar JWT — leitura interna nos route handlers. */
export const PORTAL_AUTH_EMAIL_HEADER = "x-portal-auth-email";
export const PORTAL_AUTH_ROLES_HEADER = "x-portal-auth-roles";
export const PORTAL_AUTH_NAME_HEADER = "x-portal-auth-name";
