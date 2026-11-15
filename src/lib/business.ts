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
  policiesUpdated: '15 November 2026',
} as const

/** "Clozest is operated by Premanshu Jha, a sole proprietor" — the line every public page carries. */
export const OPERATED_BY = `${BUSINESS.brand} is operated by ${BUSINESS.operator}, a ${BUSINESS.operatorKind}.`
