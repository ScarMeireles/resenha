import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './api'
import { appVersion, onUpgradeRequired, VERSION_HEADER, withVersionQuery } from './appVersion'
import { isUpgradeRequired } from './realtime'

afterEach(() => { vi.unstubAllGlobals() })

describe('versão do app nas chamadas', () => {
  it('toda chamada leva o cabeçalho de versão', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    await request('GET', '/me')

    expect(fetch.mock.calls[0][1].headers[VERSION_HEADER]).toBe(appVersion)
  })

  it('426 avisa o App para atualizar e ainda vira erro para quem chamou', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'Há uma versão nova' }), { status: 426 })))
    const listener = vi.fn()
    const off = onUpgradeRequired(listener)

    await expect(request('GET', '/friends')).rejects.toMatchObject({ status: 426, message: 'Há uma versão nova' })
    expect(listener).toHaveBeenCalledOnce()

    off()
    await expect(request('GET', '/friends')).rejects.toBeDefined()
    expect(listener).toHaveBeenCalledOnce() // depois de cancelar, não ouve mais
  })

  it('outros erros não pedem atualização', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    const listener = vi.fn()
    const off = onUpgradeRequired(listener)
    await expect(request('GET', '/friends')).rejects.toBeDefined()
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})

describe('SignalR', () => {
  it('a versão vai na URL do hub', () => {
    expect(withVersionQuery('http://servidor:8080/hubs/app')).toBe(`http://servidor:8080/hubs/app?resenha-version=${appVersion}`)
    expect(withVersionQuery('http://x/hubs/app?a=1')).toBe(`http://x/hubs/app?a=1&resenha-version=${appVersion}`)
  })

  it('reconhece o 426 do HttpError', () => {
    expect(isUpgradeRequired({ statusCode: 426 })).toBe(true)
    expect(isUpgradeRequired({ statusCode: 401 })).toBe(false)
    expect(isUpgradeRequired(new Error('sem rede'))).toBe(false)
    expect(isUpgradeRequired(null)).toBe(false)
  })
})
