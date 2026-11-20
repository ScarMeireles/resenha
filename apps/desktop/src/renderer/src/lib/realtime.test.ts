import { describe, expect, it } from 'vitest'
import { hubConnectionOptions } from './realtime'

describe('hubConnectionOptions', () => {
  it('não manda cookies (a API usa CORS "*", que o navegador recusa junto com cookies)', () => {
    expect(hubConnectionOptions('abc').withCredentials).toBe(false)
  })

  it('manda o token pelo accessTokenFactory', async () => {
    expect(await hubConnectionOptions('abc').accessTokenFactory?.()).toBe('abc')
  })
})
