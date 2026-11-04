import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { SalonDetails, SalonService, SalonSummary, Slots } from './types'

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export const salonKeys = {
  near: (lat: number, lng: number) => ['salons', 'near', round6(lat), round6(lng)] as const,
  one: (id: string) => ['salons', id] as const,
  services: (id: string) => ['salons', id, 'services'] as const,
  slots: (id: string, services: string[], date: string, moving?: string) =>
    ['salons', id, 'slots', [...services].sort(), date, moving ?? null] as const,
}

export function useNearbySalons(lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: salonKeys.near(lat ?? 0, lng ?? 0),
    queryFn: () => api<SalonSummary[]>('GET', `/api/v1/salons?lat=${round6(lat!)}&lng=${round6(lng!)}`),
    enabled: lat !== null && lng !== null,
    staleTime: 60_000,
  })
}

export function useSalon(id: string) {
  return useQuery({
    queryKey: salonKeys.one(id),
    queryFn: () => api<SalonDetails>('GET', `/api/v1/salons/${id}`),
    staleTime: 60_000,
  })
}

export function useSalonServices(id: string) {
  return useQuery({
    queryKey: salonKeys.services(id),
    queryFn: () => api<SalonService[]>('GET', `/api/v1/salons/${id}/services`),
    staleTime: 60_000,
  })
}

/** @param moving a booking of mine being moved: the backend counts its own time as free */
export function useSlots(id: string, services: string[], date: string, moving?: string) {
  const params = new URLSearchParams()
  services.forEach((s) => params.append('services', s))
  params.set('date', date)
  if (moving) params.set('moving', moving)
  return useQuery({
    queryKey: salonKeys.slots(id, services, date, moving),
    queryFn: () => api<Slots>('GET', `/api/v1/salons/${id}/availability?${params.toString()}`),
    enabled: services.length > 0,
    staleTime: 15_000,
    retry: false,
  })
}
