import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resetLanguageForTests, setLanguage } from '../../i18n'
import { tagText } from '../../lib/ratings'
import { titleOf } from './titleOf'

const read = (lang: string, area: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/i18n/${lang}/${area}.json`), 'utf8')) as Record<string, string>

describe('words written by the backend, in the reader\'s language', () => {
  afterEach(() => resetLanguageForTests())

  it('an old message in English only shows the title its type has; one already in the language as sent', async () => {
    const old = { type: 'BOOKING_CONFIRMED', title: 'Booked at Style Point' }
    expect(titleOf(old)).toBe('Booked at Style Point') // English: as sent
    await setLanguage('ta')
    expect(titleOf(old)).toBe(read('ta', 'notifications').typeBOOKING_CONFIRMED)
    expect(titleOf({ type: 'CUSTOMERHELP_REPLIED', title: 'Support replied on C-1042' })).toBe(read('ta', 'notifications').typeCUSTOMERHELP_REPLIED)
    expect(titleOf({ type: 'BOOKING_CONFIRMED', title: 'Style Point-இல் புக்கிங் ஆனது' })).toBe('Style Point-இல் புக்கிங் ஆனது')
    expect(titleOf({ type: 'SOMETHING_NEW', title: 'Something new' })).toBe('Something new')
  })

  it('a salon\'s "what went well" tags in the reader\'s language; one this app doesn\'t know: the backend\'s label', async () => {
    expect(tagText('ON_TIME', 'On time')).toBe('On time')
    await setLanguage('hi')
    expect(tagText('ON_TIME', 'On time')).toBe(read('hi', 'ratings').tagOnTime)
    expect(tagText('NEW_TAG' as never, 'New tag')).toBe('New tag')
  })
})
