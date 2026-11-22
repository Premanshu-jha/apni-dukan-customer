import { SALON_SEARCH_CHIP_KEY, SALON_SEARCH_KEY, useSalonSearch } from './salonSearch'
import { useSession } from './session'

describe('the salon search text kept in this tab', () => {
  afterEach(() => {
    useSalonSearch.getState().clear()
    window.sessionStorage.clear()
  })

  it('is kept in sessionStorage as typed and forgotten when cleared', () => {
    useSalonSearch.getState().setText('facial')
    expect(window.sessionStorage.getItem(SALON_SEARCH_KEY)).toBe('facial')
    useSalonSearch.getState().clear()
    expect(window.sessionStorage.getItem(SALON_SEARCH_KEY)).toBeNull()
    expect(useSalonSearch.getState().text).toBe('')
  })

  it('is forgotten when the person signs out (a shared phone)', () => {
    useSession.setState({ status: 'signedIn' })
    useSalonSearch.getState().setText('raju')
    useSession.setState({ status: 'signedOut' })
    expect(useSalonSearch.getState().text).toBe('')
    expect(window.sessionStorage.getItem(SALON_SEARCH_KEY)).toBeNull()
  })

  it('is forgotten on any change to signed out, also a session refused at start-up (never signed in in this tab)', () => {
    useSession.setState({ status: 'starting' })
    useSalonSearch.getState().setText('raju')
    useSession.setState({ status: 'signedOut' })
    expect(useSalonSearch.getState().text).toBe('')
    expect(window.sessionStorage.getItem(SALON_SEARCH_KEY)).toBeNull()
  })

  it('keeps the chip tapped (its English word) with the text, and forgets it once words are typed', () => {
    useSalonSearch.getState().setText('दाढ़ी', 'beard')
    expect(useSalonSearch.getState().chip).toBe('beard')
    expect(window.sessionStorage.getItem(SALON_SEARCH_CHIP_KEY)).toBe('beard')
    useSalonSearch.getState().setText('दाढ़')
    expect(useSalonSearch.getState().chip).toBeNull()
    expect(window.sessionStorage.getItem(SALON_SEARCH_CHIP_KEY)).toBeNull()
  })
})
