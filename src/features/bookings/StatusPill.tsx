import type { BookingStatus } from '../../api/types'
import { statusText, statusTone } from './status'

export function StatusPill({ status }: { status: BookingStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[status]}`}>{statusText[status]}</span>
}
