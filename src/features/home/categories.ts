/**
 * The categories, like Swiggy's Food and Instamart. Only the live ones show: a category not open yet would be a tile
 * that leads nowhere. Opening one is setting live to true (and building what it shows on Home).
 */
export const CATEGORIES = [
  { id: 'salon', label: 'Salon', icon: '✂', live: true },
  { id: 'kirana', label: 'Kirana', icon: '🛒', live: false },
  { id: 'services', label: 'Services', icon: '🔧', live: false },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

/** The categories customers see: the live ones. */
export const shownCategories = () => CATEGORIES.filter((c) => c.live)
