/** The Cloudflare Turnstile site key (public). Empty = no robot check (a local backend without a secret). */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''

/** Where customers write for help and to ask for salons in their area. */
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@clozest.in'

/**
 * Kirana shops, off by default (VITE_KIRANA_ENABLED=true turns them on; keep it the same as the backend's KIRANA_ENABLED).
 * The customer app has no kirana screens yet: when they are built, everything kirana shows only while this is true.
 */
export const KIRANA_ENABLED = import.meta.env.VITE_KIRANA_ENABLED === 'true'

/**
 * A kirana test build of the Play Store app (CI's android job on a kirana… branch, scripts/kirana-build.mjs): it shows
 * the "Kirana test build" label (components/TestBuildMark.tsx). False everywhere else.
 */
export const KIRANA_TEST_BUILD = import.meta.env.VITE_KIRANA_TEST_BUILD === 'true'
