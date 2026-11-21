import { describe, expect, it } from 'vitest'
import { serverUrls, updatesUrl } from './env'

describe('serverUrls', () => {
  it('usa o servidor de desenvolvimento quando não há .env', () => {
    expect(serverUrls({})).toEqual({ apiUrl: 'http://localhost:5280', livekitUrl: 'ws://localhost:7880' })
  })

  it('tira a barra do fim da API', () => {
    expect(serverUrls({ VITE_API_URL: 'http://servidor:8080/', VITE_LIVEKIT_URL: 'ws://servidor:7890' }))
      .toEqual({ apiUrl: 'http://servidor:8080', livekitUrl: 'ws://servidor:7890' })
  })
})

describe('updatesUrl', () => {
  it('aponta para /updates da mesma API', () => {
    expect(updatesUrl('http://servidor:8080')).toBe('http://servidor:8080/updates')
    expect(updatesUrl('http://servidor:8080/')).toBe('http://servidor:8080/updates')
  })
})
