/** The Cloudflare Turnstile site key (public). Empty = no robot check (a local backend without a secret). */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''

/** Where customers write for help and to ask for salons in their area. */
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@clozest.in'
