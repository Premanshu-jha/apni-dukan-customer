describe('booking draft', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('drops a saved day that has passed but keeps the services', async () => {
    localStorage.setItem(
      'ad.draft',
      JSON.stringify({ salonId: 's1', serviceIds: ['v1'], date: '2020-01-01', startAt: '2020-01-01T05:00:00Z', idempotencyKey: 'k' }),
    )
    const { useDraft } = await import('./bookingDraft')
    expect(useDraft.getState().draft).toMatchObject({ salonId: 's1', serviceIds: ['v1'], date: null, startAt: null })
  })

  it('a new set of services clears the picked time', async () => {
    const { useDraft } = await import('./bookingDraft')
    useDraft.getState().open('s1')
    useDraft.getState().toggleService('v1')
    useDraft.getState().pickSlot('2099-01-01T05:00:00Z')
    useDraft.getState().toggleService('v2')
    expect(useDraft.getState().draft?.startAt).toBeNull()
  })
})
