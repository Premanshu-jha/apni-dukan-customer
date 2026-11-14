import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { messageOf, salonReadMessage } from '../../api/errors'
import { useSalon, useSalonServices, useSetOfferMessages } from '../../api/salons'
import { Banner, Button, ErrorState, Loading, Page, Switch } from '../../components/ui'
import { clock12, dateTimeIst, dayLabel, weekdayName } from '../../lib/ist'
import { licenceDay, offerWhat, offerWhen, ratingText } from '../../lib/salonCard'
import { duration, rupees } from '../../lib/money'
import { MAX_SERVICES, useDraft } from '../../store/bookingDraft'
import { ServiceIcon } from '../../components/ServiceIcon'
import { SalonPhoto } from './SalonList'

export function SalonPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const salon = useSalon(id)
  const services = useSalonServices(id)
  const { draft, open, toggleService } = useDraft()
  const [now] = useState(() => Date.now())
  const [params, setParams] = useSearchParams()
  const again = params.get('services')
  const offerLink = params.get('offer')
  const offerMessages = useSetOfferMessages(id)
  // The offer the page was opened for (the link's part goes once used); ended since the message: said, not nothing
  const [linkedOffer] = useState(() => params.get('offer'))

  useEffect(() => {
    open(id)
  }, [id, open])

  // "Book again" (the come-back message): those services picked, once the salon's list says which it still offers;
  // then the link's part goes, so a reload or Back doesn't pick them again over the person's own changes
  useEffect(() => {
    if (!again || !services.data) return
    const offered = new Set(services.data.map((x) => x.id))
    const picked = again.split(',').filter((x) => offered.has(x))
    // None still offered: keep whatever the person had picked here
    if (picked.length > 0) useDraft.getState().pickOnly(id, picked)
    setParams({}, { replace: true })
  }, [again, id, services.data, setParams])

  // An offer message: the services it covers picked (those still offered; one for every service picks nothing),
  // then the link's part goes, as above
  useEffect(() => {
    if (!offerLink || !services.data || !salon.data) return
    const offer = salon.data.offers?.find((o) => o.id === offerLink)
    const offered = new Set(services.data.map((x) => x.id))
    const picked = offer && !offer.allServices ? offer.serviceIds.filter((x) => offered.has(x)) : []
    if (picked.length > 0) useDraft.getState().pickOnly(id, picked)
    setParams({}, { replace: true })
  }, [offerLink, id, salon.data, services.data, setParams])

  // A service the salon has since removed can't be seen or unticked: drop it from the saved draft
  const known = services.data
  useEffect(() => {
    if (known) useDraft.getState().keepOnly(id, known.map((x) => x.id))
  }, [id, known])

  if (salon.isPending || services.isPending) {
    return (
      <Page back="/">
        <Loading />
      </Page>
    )
  }
  // Only when there is nothing to show: a failed refresh (a 429 on coming back to the app) keeps the page
  if ((salon.isError && !salon.data) || (services.isError && !services.data)) {
    return (
      <Page back="/">
        <ErrorState
          message={salonReadMessage(salon.error ?? services.error)}
          onRetry={() => {
            void salon.refetch()
            void services.refetch()
          }}
        />
      </Page>
    )
  }

  const s = salon.data
  const picked = draft?.salonId === id ? draft.serviceIds : []
  const chosen = services.data.filter((x) => picked.includes(x.id))
  const minutes = chosen.reduce((t, x) => t + x.durationMinutes, 0)
  const paise = chosen.reduce((t, x) => t + x.pricePaise, 0)
  const isFrom = chosen.some((x) => x.priceIsFrom)
  const paused = s.pausedUntil !== null && Date.parse(s.pausedUntil) > now
  const names = new Map(services.data.map((x) => [x.id, x.name]))

  return (
    <Page
      back="/"
      title={s.name}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1">
            {chosen.length ? (
              <>
                <p className="font-semibold">
                  {chosen.length} {chosen.length === 1 ? 'service' : 'services'} · {rupees(paise, isFrom)}
                </p>
                <p className="text-sm text-muted">About {duration(minutes)}</p>
              </>
            ) : (
              <p className="text-sm text-muted">Pick one or more services</p>
            )}
          </div>
          <Button disabled={!chosen.length || Boolean(paused)} onClick={() => navigate(`/salons/${id}/book`)}>
            Pick a time
          </Button>
        </div>
      }
    >
      {(salon.isRefetchError || services.isRefetchError) && (
        <Banner tone="warn">Couldn't refresh this salon: {salonReadMessage(salon.error ?? services.error)}</Banner>
      )}
      <SalonPhoto url={s.photoUrl} name={s.name} large />
      <div className="flex flex-col gap-1">
        {s.rating && (
          <p className={s.rating.average !== null ? 'font-semibold text-accent' : 'text-sm text-muted'}>
            {ratingText(s.rating)}
            {s.rating.tags.length > 0 && (
              <span className="font-normal text-muted"> · {s.rating.tags.slice(0, 3).map((t) => t.label).join(', ')}</span>
            )}
          </p>
        )}
        <p className="text-muted">
          {s.addressLine}, {s.area}, {s.city} {s.pincode}
        </p>
        {s.licensedUntil && (
          <p className="text-sm">
            <span className="mr-2 inline-block rounded-full border border-good px-2 text-xs font-medium text-good">Licensed</span>
            <span className="text-muted">Its trade licence was checked by Clozest (valid until {licenceDay(s.licensedUntil)}).</span>
          </p>
        )}
        {s.mapLink && (
          <a href={s.mapLink} target="_blank" rel="noreferrer" className="text-sm text-link underline">
            Open in Maps
          </a>
        )}
      </div>
      {paused && (
        <Banner tone="warn">This salon isn't taking bookings until {dateTimeIst(s.pausedUntil!)}.</Banner>
      )}

      {linkedOffer && !(s.offers ?? []).some((o) => o.id === linkedOffer) && <Banner tone="info">That offer has ended. The prices below are the salon's own.</Banner>}
      {((s.offers?.length ?? 0) > 0 || (s.offerMessages ?? null) !== null) && (
        <section aria-labelledby="offers-title" className="flex flex-col gap-2">
          <h2 id="offers-title" className="text-lg font-semibold">
            Offers
          </h2>
          {(s.offers ?? []).map((o) => (
            <p key={o.id} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
              <span className="font-semibold text-accent">{o.percentOff}% off</span> {offerWhat(o, names)}
              <span className="block text-sm text-muted">{offerWhen(o)}. The price shows when you pick a time.</span>
            </p>
          ))}
          {(s.offerMessages ?? null) !== null && (
            <Switch
              label="Offer messages from this salon"
              hint={s.offerMessages ? "You've been here, so you get a message when it has a discount" : 'Off: no messages about its discounts. Its offers still show here.'}
              on={s.offerMessages === true}
              busy={offerMessages.isPending}
              onChange={(on) => offerMessages.mutate(on)}
            />
          )}
          {offerMessages.isError && <Banner tone="bad">{messageOf(offerMessages.error)}</Banner>}
        </section>
      )}

      <section aria-labelledby="services-title" className="flex flex-col gap-3">
        <h2 id="services-title" className="text-lg font-semibold">
          Services
        </h2>
        {services.data.length === 0 ? (
          <p className="text-muted">This salon hasn't added its services yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {services.data.map((x) => {
              const on = picked.includes(x.id)
              const full = !on && picked.length >= MAX_SERVICES
              return (
                <li key={x.id}>
                  <label
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${on ? 'border-brand bg-brand/10' : 'border-line bg-surface'} ${full ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full}
                      onChange={() => toggleService(x.id)}
                      className="h-5 w-5 accent-[var(--color-brand)]"
                    />
                    <ServiceIcon service={x} size={22} className="text-link" />
                    <span className="flex-1">
                      <span className="block font-medium">{x.name}</span>
                      <span className="text-sm text-muted">{duration(x.durationMinutes)}</span>
                    </span>
                    {x.offerPricePaise != null ? (
                      <span className="text-right">
                        <s className="block text-sm text-muted">{rupees(x.pricePaise, x.priceIsFrom)}</s>
                        <span className="font-semibold text-accent">{rupees(x.offerPricePaise, x.priceIsFrom)}</span>
                        <span className="block text-xs text-muted">in the offer's hours</span>
                      </span>
                    ) : (
                      <span className="font-semibold">{rupees(x.pricePaise, x.priceIsFrom)}</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {chosen.some((x) => x.priceIsFrom) && (
          <p className="text-sm text-muted">"from" prices can go up at the salon, for example for long hair.</p>
        )}
      </section>

      {s.hours.length > 0 && (
        <section aria-labelledby="hours-title" className="flex flex-col gap-2">
          <h2 id="hours-title" className="text-lg font-semibold">
            Opening hours
          </h2>
          <dl className="grid grid-cols-[4rem_1fr] gap-y-1 text-sm">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const h = s.hours.find((x) => x.weekday === d)
              return (
                <div key={d} className="contents">
                  <dt className="text-muted">{weekdayName(d)}</dt>
                  <dd>{h ? `${clock12(h.open)} – ${clock12(h.close)}` : 'Closed'}</dd>
                </div>
              )
            })}
          </dl>
          {s.closedDates?.length > 0 && (
            <p className="text-sm text-muted">Holidays: {s.closedDates.map((d) => dayLabel(d)).join(', ')}.</p>
          )}
        </section>
      )}
    </Page>
  )
}
