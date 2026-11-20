import html from '../public/offline.html?raw'
import script from '../public/offline.js?raw'

/** public/offline.html with its script, as the service worker shows it without a connection. */
function openOfflinePage() {
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '').replace(/<\/?html[^>]*>/g, '')
  new Function(script)()
}

describe('the offline page', () => {
  afterEach(() => localStorage.clear())

  it('says its lines in the language chosen in the app', () => {
    localStorage.setItem('language', 'hi')
    openOfflinePage()
    expect(document.querySelector('h1')!.textContent).toBe('आप ऑफ़लाइन हैं')
    expect(document.querySelector('a')!.textContent).toBe('फिर कोशिश करें')
    expect(document.documentElement.lang).toBe('hi')
  })

  it('has every line in every language', () => {
    for (const lang of ['te', 'mr', 'ta', 'kn']) {
      localStorage.setItem('language', lang)
      openOfflinePage()
      for (const el of ['h1', 'p', 'a']) expect(document.querySelector(el)!.textContent!.replace('Clozest', ''), `${lang} ${el}`).not.toMatch(/[A-Za-z]{2,}/)
    }
  })

  it('stays English when nothing (or English) was chosen', () => {
    openOfflinePage()
    expect(document.querySelector('h1')!.textContent).toBe("You're offline")
    localStorage.setItem('language', 'en')
    openOfflinePage()
    expect(document.querySelector('h1')!.textContent).toBe("You're offline")
  })
})
