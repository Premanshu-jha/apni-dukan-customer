import { api } from './client'
import type { HelpTicket } from './types'

/** "Need help": a support ticket from this customer (403 PROFILE_INCOMPLETE until the email is verified). */
export const helpApi = {
  ask: (message: string, subject?: string) =>
    api<HelpTicket>('POST', '/api/v1/helpdesk/tickets', { body: { app: 'CUSTOMER', subject: subject?.trim() || null, message } }),
}
