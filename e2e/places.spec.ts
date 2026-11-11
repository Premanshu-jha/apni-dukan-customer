import { expect, signedIn, test } from './helpers'

const flat = { addressLine: 'Flat 4B, Lake View Apartments', area: 'Kondapur', city: 'Hyderabad', pincode: '500084' }
/** A place id as the backend makes them (UUIDs). */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const saved = (id: string, kind: string, name: string | null, lat: number, lng: number, addressLine = flat.addressLine) => ({
  id, kind, name, ...flat, addressLine, latitude: lat, longitude: lng, updatedAt: '2026-11-01T10:00:00Z', createdAt: `2026-11-01T10:00:0${id.length}Z`,
})
const salonsAt = (api: { calls: { path: string }[] }) => api.calls.filter((c) => c.path.startsWith('/api/v1/salons?')).map((c) => new URL(`http://x${c.path}`).searchParams.get('lat'))

test('location off: the customer types an address, finds it on the map, saves it as Home and sees salons near it', async ({ page, context, api }) => {
  await signedIn(context, api, { location: false })
  await context.clearPermissions()
  await page.goto('/')
  await page.getByRole('link', { name: 'Or enter an address' }).click()
  await expect(page.getByText('No saved places yet')).toBeVisible()
  await page.getByRole('link', { name: 'Add an address' }).click()

  // The first place is Home; Find on map asks for the fields first
  await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Find on map' }).click({ force: true })   // aria-disabled until filled
  await expect(page.getByText('Fill in the address, area, city and pincode above to find it on the map.')).toBeVisible()
  expect(api.calls.some((c) => c.path === '/api/v1/me/places/geocode')).toBe(false)
  await page.getByLabel('House or flat number, building, street').fill(flat.addressLine)
  await page.getByLabel('Area').fill(flat.area)
  await page.getByLabel('City').fill(flat.city)
  await page.getByLabel('Pincode').fill(flat.pincode)
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByText('This is only close by. Drag the pin onto your building.')).toBeVisible()
  await expect(page.getByRole('application', { name: /Map: drag the pin onto your building/ })).toBeVisible()

  // Tapping the map moves the pin (west of where it was): what is saved is where the customer put it
  await page.getByRole('application', { name: /Map: drag the pin onto your building/ }).click({ position: { x: 60, y: 170 } })
  await page.getByRole('button', { name: 'Save address' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: /Salons near Home, Flat 4B, Lake View Apartments, Kondapur/ })).toBeVisible()
  const sent = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/me/places')!.body as Record<string, number | string>
  expect(sent).toMatchObject({ kind: 'HOME', ...flat })
  expect(sent.longitude as number).toBeLessThan(78.3644)
  await expect.poll(() => salonsAt(api).at(-1)).toBe(String(sent.latitude))
})

test('use current location fills only the empty fields; an Other needs a name; Home is taken already', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await context.setGeolocation({ latitude: 17.4402, longitude: 78.3489, accuracy: 12 })
  await page.goto('/places/new')
  // Home exists: a new place starts as Work
  await expect(page.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.getByText(/You already have a Home address \(Flat 4B, Lake View Apartments\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Other' }).click()

  await page.getByLabel('House or flat number, building, street').fill('Gym 2, Road 5')
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByText("We filled the address from your location. Check it and correct anything that's wrong.")).toBeVisible()
  await expect(page.getByLabel('House or flat number, building, street')).toHaveValue('Gym 2, Road 5')   // kept
  await expect(page.getByLabel('Area')).toHaveValue('Kondapur')
  await expect(page.getByLabel('Pincode')).toHaveValue('500084')
  await expect(page.getByText('GPS was accurate to about 12 m.')).toBeVisible()

  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page.getByText('Give this place a name, e.g. Gym.')).toBeVisible()
  expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/me/places')).toBe(false)
  await page.getByLabel('Name').fill('Gym')
  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page.getByRole('link', { name: /Salons near Gym, Gym 2, Road 5, Kondapur/ })).toBeVisible()
  expect(api.places.find((p) => p.kind === 'OTHER')).toMatchObject({ name: 'Gym', latitude: 17.4402, longitude: 78.3489 })
})

test('the picker: a saved place or the current location; a place deleted on another phone goes back to the current location', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644), saved(uid(2), 'WORK', null, 17.45, 78.38, 'Cyber Towers')]
  await page.goto('/')
  await expect(page.getByText('Near your current location')).toBeVisible()
  await page.getByRole('link', { name: 'Change where to find salons' }).click()
  await expect(page.getByRole('button', { name: /Current location/ })).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: /^Work/ }).click()
  await expect(page.getByRole('link', { name: /Salons near Work, Cyber Towers, Kondapur/ })).toBeVisible()
  await expect.poll(() => salonsAt(api).at(-1)).toBe('17.45')

  await page.getByRole('link', { name: /Salons near Work/ }).click()
  await expect(page.getByRole('button', { name: /^Work/ })).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: /Current location/ }).click()
  await expect(page.getByText('Near your current location')).toBeVisible()

  // Home picked, then deleted on another phone: back to the current location
  await page.goto('/places')
  await page.getByRole('button', { name: /^Home/ }).click()
  await expect(page.getByRole('link', { name: /Salons near Home/ })).toBeVisible()
  api.places = api.places.filter((p) => p.id !== uid(1))
  await page.reload()
  await expect(page.getByText('Near your current location')).toBeVisible()
})

test('changing a picked place moves its salons; deleting it asks once more and goes back to the current location', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await page.goto('/places')
  await page.getByRole('button', { name: /^Home/ }).click()
  await page.goto('/places')
  await page.getByRole('link', { name: 'Change Home' }).click()
  await expect(page.getByLabel('Area')).toHaveValue('Kondapur')
  await expect(page.getByRole('application', { name: /Map: drag the pin onto your building/ })).toBeVisible()
  await page.getByLabel('House or flat number, building, street').fill('Flat 7C, Lake View Apartments')
  // The address changed after the pin: the customer is told, and can search again
  api.geocodeAnswer = { latitude: 17.47, longitude: 78.37, precision: 'EXACT', formattedAddress: 'Flat 7C' }
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByText('Check the pin is on your building.')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(/\/places$/)
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Salons near Home, Flat 7C, Lake View Apartments, Kondapur/ })).toBeVisible()
  await expect.poll(() => salonsAt(api).at(-1)).toBe('17.47')

  await page.goto(`/places/${uid(1)}`)
  await page.getByRole('button', { name: 'Delete this place' }).click()
  await page.getByRole('button', { name: 'Keep it' }).click()
  expect(api.places).toHaveLength(1)
  await page.getByRole('button', { name: 'Delete this place' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByText('No saved places yet')).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('Near your current location')).toBeVisible()
})

test('address search: not found, turned off (the button goes), 10 places at most; signing out forgets the picked place', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/places/new')
  await page.getByLabel('House or flat number, building, street').fill(flat.addressLine)
  await page.getByLabel('Area').fill(flat.area)
  await page.getByLabel('City').fill(flat.city)
  await page.getByLabel('Pincode').fill(flat.pincode)
  api.geocodeError = { status: 404, code: 'ADDRESS_NOT_FOUND' }
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByText("Couldn't find that address. Check the pincode and area, or use your current location.")).toBeVisible()
  api.geocodeError = { status: 503, code: 'GEOCODING_OFF' }
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByRole('button', { name: 'Find on map' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use current location' })).toBeFocused()

  api.places = Array.from({ length: 10 }, (_, i) => saved(uid(10 + i), 'OTHER', `Place ${i}`, 17.4 + i / 100, 78.36))
  await page.goto('/places')
  await expect(page.getByText("You've saved 10 places, the most there can be. Change or delete one to add another.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add an address' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Place 3/ }).click()
  await expect(page.getByRole('link', { name: /Salons near Place 3/ })).toBeVisible()

  await page.goto('/profile')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin/)
  expect(await page.evaluate(() => localStorage.getItem('ad.chosenPlace'))).toBeNull()
})

test('the pin: moved from the GPS point (said how far), by the keyboard too; poor GPS and a pin outside India are said', async ({ page, context, api }) => {
  await signedIn(context, api)
  await context.setGeolocation({ latitude: 17.4402, longitude: 78.3489, accuracy: 400 })
  await page.goto('/places/new')
  for (const [label, value] of [['House or flat number, building, street', 'Flat 2'], ['Area', 'Kondapur'], ['City', 'Hyderabad'], ['Pincode', '500084']]) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByText("The phone isn't sure where it is.", { exact: false })).toBeVisible()
  // Every field was filled: the address at the point isn't asked for
  expect(api.calls.some((c) => c.path === '/api/v1/me/places/reverse-geocode')).toBe(false)
  await page.getByRole('application', { name: /drag the pin/ }).click({ position: { x: 60, y: 170 } })
  await expect(page.getByText(/Moved \d+ m from the GPS point\./)).toBeVisible()
  // With the pin focused, the arrow keys move it (east)
  const before = (await page.getByText(/Moved \d+ m/).textContent())!
  await page.locator('.leaflet-marker-icon').focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByText(/Moved \d+ m from the GPS point\./)).not.toHaveText(before)
  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page).toHaveURL(/\/$/)

  // GPS outside India: said, Save sends nothing and points at the map
  await context.setGeolocation({ latitude: 51.5, longitude: -0.12, accuracy: 20 })
  await page.goto('/places/new')
  await page.getByRole('button', { name: 'Other' }).click()
  await page.getByLabel('Name').fill('Abroad')
  for (const [label, value] of [['House or flat number, building, street', 'Baker St'], ['Area', 'Marylebone'], ['City', 'London'], ['Pincode', '110001']]) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByText('The pin must be in India.')).toBeVisible()
  const posts = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/me/places').length
  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page.getByText('On the map', { exact: true })).toBeFocused()
  expect(api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/me/places')).toHaveLength(posts)
})

test('an address edited after Find on map says to search again; Home taken: Save points at it; a day of searches used up', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await page.goto('/places/new')
  await page.getByRole('button', { name: 'Home' }).click()
  for (const [label, value] of [['House or flat number, building, street', 'Flat 9'], ['Area', 'Kondapur'], ['City', 'Hyderabad'], ['Pincode', '500084']]) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByText('This is only close by. Drag the pin onto your building.')).toBeVisible()
  await page.getByLabel('Area').fill('Madhapur')
  await expect(page.getByText('You changed the address. Tap Find on map again, or drag the pin.')).toBeVisible()
  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page.getByText('Save as', { exact: true })).toBeFocused()
  expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/me/places')).toBe(false)

  api.geocodeError = { status: 429, code: 'TRY_LATER', retryAfter: 80_000 }
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByText("You've used today's address searches. Try again tomorrow, or use your current location.")).toBeVisible()
})

test('a lost answer on Save: the second tap finds it saved, no copy; a reload keeps what was typed', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/places/new')
  await page.getByRole('button', { name: 'Other' }).click()
  await page.getByLabel('Name').fill('Gym')
  for (const [label, value] of [['House or flat number, building, street', 'Gym 2, Road 5'], ['Area', 'Kondapur'], ['City', 'Hyderabad'], ['Pincode', '500084']]) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Find on map' }).click()
  await expect(page.getByRole('application', { name: /drag the pin/ })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Name')).toHaveValue('Gym')
  await expect(page.getByLabel('Area')).toHaveValue('Kondapur')
  await expect(page.getByRole('application', { name: /drag the pin/ })).toBeVisible()

  api.loseNextAdd = true
  await page.getByRole('button', { name: 'Save address' }).click()
  await expect(page.getByRole('link', { name: /Salons near Gym, Gym 2, Road 5, Kondapur/ })).toBeVisible()
  expect(api.places).toHaveLength(1)
  // Saved: a new form starts empty
  await page.goto('/places/new')
  await expect(page.getByLabel('Area')).toHaveValue('')
})

test('a place deleted on another phone while being changed: the form stays and it can be saved as a new place', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await page.goto(`/places/${uid(1)}`)
  await page.getByLabel('House or flat number, building, street').fill('Flat 8D')
  api.places = []
  // The list is read again (the window regains focus); the form keeps the typing
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('This place was deleted on another phone.')).toBeVisible()
  await expect(page.getByLabel('House or flat number, building, street')).toHaveValue('Flat 8D')
  await page.getByRole('button', { name: 'Save it as a new place' }).click()
  await expect(page.getByRole('link', { name: /Salons near Home, Flat 8D/ })).toBeVisible()
  expect(api.places).toHaveLength(1)
})

test('changed on another phone: Home shows its new words and pin; /places/new with 10 saved says so', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await page.goto('/places')
  await page.getByRole('button', { name: /^Home/ }).click()
  api.places[0] = { ...api.places[0], addressLine: 'Villa 3', latitude: 17.5 }
  await page.reload()
  await expect(page.getByRole('link', { name: /Salons near Home, Villa 3, Kondapur/ })).toBeVisible()
  await expect.poll(() => salonsAt(api).at(-1)).toBe('17.5')

  api.places = Array.from({ length: 10 }, (_, i) => saved(uid(10 + i), 'OTHER', `Place ${i}`, 17.4, 78.36))
  await page.goto('/places/new')
  await expect(page.getByText("You've saved 10 places")).toBeVisible()
})

test('a session the backend ends (expired, signed out everywhere) forgets the picked place on this phone', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await page.goto('/places')
  await page.getByRole('button', { name: /^Home/ }).click()
  await expect(page.getByRole('link', { name: /Salons near Home/ })).toBeVisible()
  // Signed out everywhere from another phone: this phone's refresh token no longer works
  for (const t of api.refreshTokens.keys()) api.refreshTokens.set(t, 'gone' as never)
  await page.reload()
  await expect(page).toHaveURL(/\/signin/)
  expect(await page.evaluate(() => [localStorage.getItem('ad.chosenPlace'), localStorage.getItem('ad.location')])).toEqual([null, null])
})

test("back goes where the customer came from: Profile's addresses back to Profile; picking from Home doesn't loop", async ({ page, context, api }) => {
  await signedIn(context, api)
  api.places = [saved(uid(1), 'HOME', null, 17.4651, 78.3644)]
  await page.goto('/profile')
  await page.getByRole('link', { name: 'Manage addresses' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/profile$/)

  await page.goto('/')
  await page.getByRole('link', { name: 'Change where to find salons' }).click()
  await page.getByRole('link', { name: 'Change Home' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(/\/places$/)
  await page.getByRole('button', { name: /^Home/ }).click()
  await expect(page).toHaveURL(/\/$/)
  // The phone's Back from Home leaves the places behind, rather than reopening them
  await page.goBack()
  await expect(page).not.toHaveURL(/\/places/)
})
