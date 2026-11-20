import { useCallback, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { useSalon, useSalonServices } from '../../api/salons'
import { Banner, Button, Page } from '../../components/ui'
import { todayIst, timeIst } from '../../lib/ist'
import { duration } from '../../lib/money'
import { useDraft } from '../../store/bookingDraft'
import { DateChips, SlotGrid } from './SlotGrid'
import { useT } from '../../i18n'

export function BookTime() {
  const t = useT()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const slotTaken = Boolean((useLocation().state as { slotTaken?: boolean } | null)?.slotTaken)
  const salon = useSalon(id)
  const services = useSalonServices(id)
  const { draft, pickDate, pickSlot } = useDraft()
  const ready = draft?.salonId === id && draft.serviceIds.length > 0
  const date = draft?.date ?? todayIst()
  // The picked time was taken by someone else while on screen (a refresh no longer lists it)
  const [taken, setTaken] = useState(false)
  const selectedGone = useCallback(() => {
    pickSlot(null)
    setTaken(true)
  }, [pickSlot])

  useEffect(() => {
    if (ready && !draft.date) pickDate(todayIst())
  }, [ready, draft?.date, pickDate])

  if (!ready) return <Navigate to={`/salons/${id}`} replace />

  const minutes = (services.data ?? [])
    .filter((s) => draft.serviceIds.includes(s.id))
    .reduce((sum, s) => sum + s.durationMinutes, 0)

  return (
    <Page
      back={`/salons/${id}`}
      title={t('salon.pickTimeTitle')}
      footer={
        <Button className="w-full" disabled={!draft.startAt} onClick={() => navigate(`/salons/${id}/confirm`)}>
          {draft.startAt ? t('salon.continueWith', { time: timeIst(draft.startAt) }) : t('salon.pickTime')}
        </Button>
      }
    >
      <p className="text-muted">
        {salon.data?.name}
        {minutes > 0 && ` · ${t('salon.aboutDuration', { duration: duration(minutes) })}`}
      </p>
      {slotTaken && !taken && !draft.startAt && (
        <Banner tone="warn">{t('salon.slotTaken')}</Banner>
      )}
      {taken && !draft.startAt && <Banner tone="warn">{t('salon.timeNotFree')}</Banner>}
      <DateChips
        value={date}
        onChange={(d) => {
          setTaken(false)
          pickDate(d)
        }}
        maxDaysAhead={salon.data?.maxDaysAhead}
      />
      <SlotGrid
        salonId={id}
        serviceIds={draft.serviceIds}
        date={date}
        selected={draft.startAt}
        onPick={(at, terms, price) => {
          setTaken(false)
          pickSlot(at, terms, price)
        }}
        onSelectedGone={selectedGone}
      />
    </Page>
  )
}
