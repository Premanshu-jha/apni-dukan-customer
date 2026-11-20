import type { ServiceLine } from '../../api/types'
import { ServiceIcon } from '../../components/ServiceIcon'
import { iconOf } from '../../lib/serviceIcons'

/**
 * A booking's services as pictures on its card (at most 3, one per kind), so it is known without reading. Hidden from
 * screen readers: the services line beside it says it.
 */
export function BookingServiceIcons({ services }: { services: ServiceLine[] }) {
  const kinds = [...new Set(services.map((s) => iconOf({ name: s.name })))].slice(0, 3)
  if (kinds.length === 0) return null
  return (
    <span className="flex items-center gap-1.5 text-link" data-testid="booking-service-icons">
      {kinds.map((icon) => (
        <ServiceIcon key={icon} icon={icon} size={18} />
      ))}
    </span>
  )
}
