import { describe, expect, it } from 'vitest'
import { buildCsp, httpAndWs } from './csp'

describe('httpAndWs', () => {
  it('gera http e ws a partir de qualquer um dos dois', () => {
    expect(httpAndWs('http://localhost:5280/')).toEqual(['http://localhost:5280', 'ws://localhost:5280'])
    expect(httpAndWs('ws://localhost:7880')).toEqual(['http://localhost:7880', 'ws://localhost:7880'])
  })

  it('mantém a versão segura (https/wss)', () => {
    expect(httpAndWs('wss://midia.exemplo.com')).toEqual(['https://midia.exemplo.com', 'wss://midia.exemplo.com'])
  })
})

describe('buildCsp', () => {
  it('libera SignalR (ws da API) e o LiveKit (ws + http) no connect-src', () => {
    const csp = buildCsp('http://localhost:5280', 'ws://localhost:7880')
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src'))
    expect(connect).toBe("connect-src 'self' http://localhost:5280 ws://localhost:5280 http://localhost:7880 ws://localhost:7880")
    expect(csp).toContain("script-src 'self'")
  })
})
