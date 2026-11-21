import { SEARCH_CHIPS, chipOf, englishSearch, foldSearch, searchLength, searchQuery, tidySearch } from './salonSearch'

describe('the salon search text, as the backend reads it', () => {
  it('drops spaces at the ends and makes runs of spaces one', () => {
    expect(tidySearch('  hair    colour  ')).toBe('hair colour')
    expect(tidySearch('\t \n')).toBe('')
  })

  it('counts characters as the backend does (code points)', () => {
    expect(searchLength('दाढ़ी')).toBe(5)
    expect(searchLength('ab')).toBe(2)
  })

  it('sends nothing below 2 characters: the list as without a search', () => {
    expect(searchQuery('')).toBe('')
    expect(searchQuery('  f  ')).toBe('')
    expect(searchQuery('fa')).toBe('fa')
  })

  it('sends the words as typed, tidied, and at most 60 characters', () => {
    expect(searchQuery('  Raju   Hair ')).toBe('Raju Hair')
    expect(searchQuery('x'.repeat(70))).toBe('x'.repeat(60))
    expect(searchQuery('50% off_now\\')).toBe('50% off_now\\')   // the backend takes these literally
  })

  it("sends a chip's English word for its label in any of the 6 languages, typed in any case", () => {
    expect(searchQuery('दाढ़ी')).toBe('beard')
    expect(searchQuery(' फ़ेशियल ')).toBe('facial')
    expect(searchQuery('HAIR COLOUR')).toBe('hair colour')
    expect(searchQuery('facials')).toBe('facials')   // only the whole label
    expect(searchQuery('గడ్డం')).toBe('beard')   // Telugu, whatever language is showing
    expect(searchQuery('ಹೇರ್\u200cಕಟ್')).toBe('haircut')   // Kannada, with its invisible joiner
    expect(searchQuery('தாடி')).toBe('beard')
    expect(searchQuery('दाढी')).toBe('beard')   // Marathi (no nukta)
  })

  it('a chip tapped is searched by its English word, whatever the box shows by now (a language switch)', () => {
    expect(searchQuery('दाढ़ी', 'beard')).toBe('beard')
    expect(searchQuery('Beard', 'beard')).toBe('beard')
    expect(chipOf('दाढ़ी')).toBe('beard')
    expect(chipOf('Beard')).toBe('beard')
    expect(chipOf('बियर्ड')).toBeNull()   // a word, not a chip's label
  })

  it('has one chip per word, each with a picture', () => {
    expect(new Set(SEARCH_CHIPS.map((c) => c.q)).size).toBe(SEARCH_CHIPS.length)
    expect(SEARCH_CHIPS.every((c) => c.icon !== 'OTHER')).toBe(true)
  })
})

describe('words in another script, sent as the English word salons use', () => {
  it('folds the nukta and the invisible joiners, in lower case', () => {
    expect(foldSearch('फ़ेशियल')).toBe(foldSearch('फेशियल'))
    expect(foldSearch('\u092B\u093C')).toBe('\u092B')
    expect(foldSearch('హెయిర్\u200cకట్')).toBe('హెయిర్కట్')
    expect(foldSearch('  Hair   COLOUR ')).toBe('hair colour')
  })

  it("finds a service's English word: without the nukta, part of a name, a word of a name", () => {
    expect(searchQuery('फेशियल')).toBe('facial')   // typed without the nukta
    expect(searchQuery('हेयर')).toBe('hair')   // the first word of हेयर कलर, हेयर वॉश…
    expect(searchQuery('बियर्ड')).toBe('beard')
    expect(searchQuery('मसाज')).toBe('massage')
    expect(searchQuery('హెడ్ మసాజ్')).toBe('head massage')   // a whole name, Telugu
    expect(searchQuery('ஹேர் கலர்')).toBe('hair colour')
    expect(searchQuery('फेशि')).toBe('facial')   // the start of a word, from 3 characters
    expect(searchQuery('मैनी')).toBe('manicure')
  })

  it('leaves Latin words, and words that are no service name, as typed', () => {
    expect(searchQuery('baal')).toBe('baal')
    expect(searchQuery('Raju Hair')).toBe('Raju Hair')
    expect(searchQuery('रवि')).toBe('रवि')   // maybe a salon named in Hindi
    // A word that is no service name: the whole text as typed (a salon named in Hindi; the backend needs every word,
    // so "रवि hair" or "hair सैलून" would find nothing)
    expect(englishSearch('रवि हेयर')).toBe('रवि हेयर')
    expect(englishSearch('हेयर सैलून')).toBe('हेयर सैलून')
    expect(englishSearch('राजू हेयर')).toBe('राजू हेयर')
    // Every word in another script a service word: each one in English, Latin words as typed
    expect(englishSearch('बियर्ड ट्रिम')).toBe('beard trim')
    expect(englishSearch('Raju बियर्ड')).toBe('Raju beard')
    expect(searchQuery('हे')).toBe('हे')   // 2 characters: too short to be the start of a word
  })
})
