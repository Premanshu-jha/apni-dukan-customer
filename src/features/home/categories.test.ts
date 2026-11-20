import { CATEGORIES, shownCategories } from './categories'

describe('categories', () => {
  it('salon only on main: no kirana category, not even hidden', () => {
    expect(CATEGORIES.map((c) => c.id as string)).not.toContain('kirana')
    expect(shownCategories().map((c) => c.id)).toEqual(['salon'])
  })
})
