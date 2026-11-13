import { describe, expect, it } from 'vitest'
import { securityHeaders } from '../security-headers'

const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''

describe('the security headers and the map tiles', () => {
  it("allows OpenStreetMap's tiles by default, and only images from there (no scripts or calls)", () => {
    const csp = securityHeaders({ VITE_API_URL: 'https://api.example.com' })['Content-Security-Policy']
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://tile.openstreetmap.org")
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://api.example.com https://*.r2.cloudflarestorage.com")
    expect(directive(csp, 'media-src')).toBe("media-src 'self' blob: https://*.r2.cloudflarestorage.com")
  })

  it('a tile server with sub-domains ({s}) is allowed on any of them', () => {
    const csp = securityHeaders({ VITE_MAP_TILES: 'https://{s}.tiles.example.org/{z}/{x}/{y}.png' })['Content-Security-Policy']
    expect(directive(csp, 'img-src')).toContain('https://*.tiles.example.org')
  })
})
