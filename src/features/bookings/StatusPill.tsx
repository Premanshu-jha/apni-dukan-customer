import type { BookingStatus } from '../../api/types'
import { useT } from '../../i18n'
import { statusKey, statusTone } from './status'

export function StatusPill({ status }: { status: BookingStatus }) {
  const t = useT()
  // Never wraps or shrinks: the salon's name beside it wraps instead (the status stays whole in every language)
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[status]}`}>{t(statusKey[status])}</span>
}
