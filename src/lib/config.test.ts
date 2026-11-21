import { describe, expect, it } from 'vitest'
import { KIRANA_ENABLED } from './config'

describe('kirana switch', () => {
  it('is off unless the build says true', () => {
    expect(import.meta.env.VITE_KIRANA_ENABLED).not.toBe('true')
    expect(KIRANA_ENABLED).toBe(false)
  })
})
