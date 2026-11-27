import { SUPPORT_EMAIL } from './config'

/**
 * Who runs Clozest, as shown on the customer app's public pages (About, Contact, Terms, Privacy). Customers pay Clozest
 * nothing, so nothing here is about prices: the salons' subscription and its policies are on the partner app
 * (partner.clozest.in), which has its own copy of these details. Change these in one place when they change.
 */
export const BUSINESS = {
  brand: 'Clozest',
  operator: 'Premanshu Jha',
  /** How the operator is described in the policies */
  operatorKind: 'sole proprietor',
  email: SUPPORT_EMAIL,
  phone: '+91 93812 51613',
  /** Shown on the Contact page and in the policies */
  address: 'G-10, A Block, G.K. Habitat Royal, Yapral, Secunderabad, Hyderabad, Telangana 500094, India',
  website: 'https://clozest.in',
  /** The partner app, for salon owners (their sign-up, the subscription and its policies) */
  partnerSite: 'https://partner.clozest.in',
  /** The date the policies were last changed (shown at the top of each) */
  /** When the policies last changed (shown as a date in the reader's language; English: "15 November 2026"). */
  policiesUpdated: '2026-11-15',
} as const

/** "Clozest is operated by Premanshu Jha, a sole proprietor" — the line every public page carries. */
export const OPERATED_BY = `${BUSINESS.brand} is operated by ${BUSINESS.operator}, a ${BUSINESS.operatorKind}.`

/** The support number as a phone link ("tel:+919381251613"): works on any screen, inside the router or not. */
export const CALL_LINK = `tel:${BUSINESS.phone.replace(/[^\d+]/g, '')}`

/**
 * A WhatsApp chat with support, with the first words already typed ("Hi Clozest, I need help with: My booking"), so
 * someone who can't find the words only has to tap Send. Opens WhatsApp on a phone (the app, or WhatsApp Web).
 */
export function whatsAppLink(text: string): string {
  return `https://wa.me/${BUSINESS.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}
