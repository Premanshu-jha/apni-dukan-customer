import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { api } from '../../api/client'
import { useSalonSearch } from '../../store/salonSearch'
import { setLanguage } from '../../i18n'
import { SalonList } from './SalonList'

vi.mock('../../api/client', () => ({ api: vi.fn() }))
// The list waits 300 ms after typing: give a busy test machine room beyond the default 1 s
configure({ asyncUtilTimeout: 4000 })
const mocked = vi.mocked(api)

const salon = (id: string, name: string) => ({
  id, name, addressLine: 'Shop 1', area: 'Kondapur', city: 'Hyderabad', distanceKm: 0.4, distanceMetres: 400, photoUrl: null,
  rating: { count: 0, average: null, tags: [] }, topServices: [], serviceCount: 0, today: null, openNow: null, closedToday: false,
  registered: false,
})

/** Answers the list: every salon without q; with q, those whose name has it ("facial" finds "Facial Point"). */
function answer(all = [salon('a', 'Raju Hair'), salon('b', 'Facial Point')]) {
  mocked.mockImplementation((_method: string, path: string) => {
    const q = new URL(path, 'http://x').searchParams.get('q')
    return Promise.resolve(q ? all.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())) : all) as never
  })
}

const searched = () => mocked.mock.calls.map((c) => new URL(c[1], 'http://x').searchParams.get('q'))

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <SalonList lat={17.466} lng={78.365} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the salon list search', () => {
  beforeEach(() => {
    mocked.mockReset()
    useSalonSearch.getState().clear()
  })

  it('waits for a pause in typing, then asks once with the whole word and shows the matches', async () => {
    answer()
    show()
    expect(await screen.findByText('2 salons within 2 km, nearest first')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search salons' }), 'facial')
    expect(await screen.findByText('1 salon matching ‘facial’ within 2 km')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Facial Point/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Raju Hair/ })).not.toBeInTheDocument()
    expect(searched()).toEqual([null, 'facial'])   // not one request per letter
  })

  it('one letter asks nothing and says to type more; clearing shows all salons again at once', async () => {
    answer()
    show()
    const box = await screen.findByRole('searchbox', { name: 'Search salons' })
    await userEvent.type(box, 'f')
    expect(screen.getByText('Type at least 2 letters to search')).toBeInTheDocument()
    await userEvent.type(box, 'acial')
    await screen.findByText('1 salon matching ‘facial’ within 2 km')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
    expect(await screen.findByText('2 salons within 2 km, nearest first')).toBeInTheDocument()
    expect(searched().filter((q) => q === 'f')).toEqual([])
  })

  it('a chip searches at once for its word; tapping it again goes back to all', async () => {
    answer([salon('a', 'Raju Hair'), salon('b', 'Beard Bros')])
    show()
    await screen.findByText('2 salons within 2 km, nearest first')
    const chip = screen.getByRole('button', { name: 'Beard' })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('searchbox')).toHaveValue('Beard')
    expect(await screen.findByText('1 salon matching ‘Beard’ within 2 km')).toBeInTheDocument()
    expect(searched()).toContain('beard')
    await userEvent.click(chip)
    expect(await screen.findByText('2 salons within 2 km, nearest first')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('nothing found: says so with the words, a button back to all salons and the help link', async () => {
    answer()
    show()
    await screen.findByText('2 salons within 2 km, nearest first')
    await userEvent.type(screen.getByRole('searchbox'), 'pedicure{Enter}')
    expect(await screen.findByText('No salon within 2 km offers ‘pedicure’ yet')).toBeInTheDocument()
    const help = screen.getByRole('link', { name: 'Let us know' })
    expect(decodeURIComponent(help.getAttribute('href')!.replace(/\+/g, ' '))).toContain('I searched for: pedicure')
    await userEvent.click(screen.getByRole('button', { name: 'Show all salons near you' }))
    expect(await screen.findByText('2 salons within 2 km, nearest first')).toBeInTheDocument()
  })

  it('words typed before are searched at once when the list opens again (back from a salon)', async () => {
    answer()
    useSalonSearch.getState().setText('facial')
    show()
    expect(await screen.findByText('1 salon matching ‘facial’ within 2 km')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('facial')
    await waitFor(() => expect(searched()).toEqual(['facial']))   // never the whole list first
  })

  it('a chip tapped in Hindi, then the app in English: still searches its English word, shows its English label pressed', async () => {
    answer([salon('a', 'Raju Hair'), salon('b', 'Beard Bros')])
    await setLanguage('hi')
    try {
      show()
      const chip = await screen.findByRole('button', { name: 'दाढ़ी' })
      await userEvent.click(chip)
      expect(screen.getByRole('searchbox')).toHaveValue('दाढ़ी')
      await waitFor(() => expect(searched()).toContain('beard'))
      await act(() => setLanguage('en'))
      expect(screen.getByRole('button', { name: 'Beard' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('searchbox')).toHaveValue('Beard')
      expect(await screen.findByText('1 salon matching ‘Beard’ within 2 km')).toBeInTheDocument()
      expect(searched().filter((q) => q !== null && q !== 'beard')).toEqual([])   // never q=दाढ़ी
    } finally {
      await setLanguage('en')
    }
  })

  it('a Hindi word that is no chip label is sent as the English word salons use', async () => {
    answer([salon('a', 'Raju Hair'), salon('b', 'Facial Point')])
    show()
    await screen.findByText('2 salons within 2 km, nearest first')
    await userEvent.type(screen.getByRole('searchbox'), 'फेशियल{Enter}')
    expect(await screen.findByText('1 salon matching ‘फेशियल’ within 2 km')).toBeInTheDocument()
    expect(searched()).toEqual([null, 'facial'])
  })

  it('"You\'re offline" under Show more goes once another search is made', async () => {
    const many = Array.from({ length: 30 }, (_, i) => salon(`f${i}`, `Facial ${i}`))
    answer([...many, salon('r', 'Raju Hair')])
    show()
    await screen.findByText('Salons within 2 km, nearest first')
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Show more salons' }))
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      online.mockReturnValue(true)
      await userEvent.type(screen.getByRole('searchbox'), 'raju{Enter}')
      expect(await screen.findByText('1 salon matching ‘raju’ within 2 km')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })
})
