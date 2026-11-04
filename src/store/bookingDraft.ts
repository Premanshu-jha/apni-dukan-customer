import { create } from 'zustand'
import { storage } from '../lib/storage'
import { todayIst } from '../lib/ist'

const KEY = 'ad.draft'

/** What the person has picked so far. Kept on the phone so it survives a reload. */
export interface Draft {
  salonId: string
  serviceIds: string[]
  date: string | null
  startAt: string | null
  /** One key per booking attempt, so a retried Book never makes two bookings. */
  idempotencyKey: string
}

interface DraftState {
  draft: Draft | null
  /** Starts a draft for this salon, or keeps the one already open for it. */
  open: (salonId: string) => Draft
  toggleService: (serviceId: string) => void
  pickDate: (date: string) => void
  pickSlot: (startAt: string | null) => void
  /** Forgets picked services this salon no longer offers. */
  keepOnly: (salonId: string, serviceIds: string[]) => void
  /** A new key after an answer from the backend that is final for that attempt. */
  newAttempt: () => void
  clear: () => void
}

/** A draft saved on an earlier day keeps its services; a day or time already gone is dropped. */
function dropPast(draft: Draft | null): Draft | null {
  if (!draft) return null
  const gone = (draft.date !== null && draft.date < todayIst()) || (draft.startAt !== null && Date.parse(draft.startAt) <= Date.now())
  return gone ? { ...draft, date: null, startAt: null } : draft
}

function save(draft: Draft | null) {
  if (draft) storage.setJson(KEY, draft)
  else storage.remove(KEY)
}

export const useDraft = create<DraftState>((set, get) => {
  const update = (patch: Partial<Draft>) => {
    const d = get().draft
    if (!d) return
    const next = { ...d, ...patch }
    save(next)
    set({ draft: next })
  }
  return {
    draft: dropPast(storage.getJson<Draft>(KEY)),

    open: (salonId) => {
      const d = dropPast(get().draft)
      if (d && d.salonId === salonId) {
        if (d !== get().draft) {
          save(d)
          set({ draft: d })
        }
        return d
      }
      const fresh: Draft = { salonId, serviceIds: [], date: null, startAt: null, idempotencyKey: crypto.randomUUID() }
      save(fresh)
      set({ draft: fresh })
      return fresh
    },
    toggleService: (serviceId) => {
      const d = get().draft
      if (!d) return
      const has = d.serviceIds.includes(serviceId)
      // A different set of services needs a different length of time: the picked slot no longer holds.
      update({
        serviceIds: has ? d.serviceIds.filter((s) => s !== serviceId) : [...d.serviceIds, serviceId],
        startAt: null,
      })
    },
    pickDate: (date) => update({ date, startAt: null }),
    pickSlot: (startAt) => update({ startAt }),
    newAttempt: () => update({ idempotencyKey: crypto.randomUUID() }),
    keepOnly: (salonId, serviceIds) => {
      const d = get().draft
      if (!d || d.salonId !== salonId) return
      const kept = d.serviceIds.filter((s) => serviceIds.includes(s))
      if (kept.length !== d.serviceIds.length) update({ serviceIds: kept, startAt: null })
    },
    clear: () => {
      save(null)
      set({ draft: null })
    },
  }
})

/** Backend limit: at most 10 services in one booking. */
export const MAX_SERVICES = 10
