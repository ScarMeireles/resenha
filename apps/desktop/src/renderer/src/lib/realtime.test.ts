import { describe, expect, it, vi } from 'vitest'
import { bindHandlers, createLifecycle, hubConnectionOptions, type HubLike, type RealtimeHandlers } from './realtime'

describe('hubConnectionOptions', () => {
  it('não manda cookies (a API usa CORS "*", que o navegador recusa junto com cookies)', () => {
    expect(hubConnectionOptions('abc').withCredentials).toBe(false)
  })

  it('manda o token pelo accessTokenFactory', async () => {
    expect(await hubConnectionOptions('abc').accessTokenFactory?.()).toBe('abc')
  })
})

describe('bindHandlers', () => {
  const names = [
    'voiceParticipants', 'callIncoming', 'callAccepted', 'callDeclined', 'callCancelled', 'callEnded', 'presenceChanged', 'userUpdated',
  ] as const

  function setup() {
    const registered = new Map<string, (...args: never[]) => void>()
    let reconnected: () => void = () => undefined
    const hub: HubLike = {
      on: (event, handler) => void registered.set(event, handler),
      onreconnected: (handler) => void (reconnected = handler),
    }
    const handlers = Object.fromEntries([...names, 'resync'].map((n) => [n, vi.fn()])) as unknown as RealtimeHandlers
    bindHandlers(hub, handlers)
    return { registered, handlers, reconnected: () => reconnected() }
  }

  it.each(names)('liga o evento %s ao handler', (name) => {
    const { registered, handlers } = setup()
    const payload = { room: 'r', userId: 'u' } as never
    registered.get(name)?.(payload)
    expect(handlers[name]).toHaveBeenCalledWith(payload)
  })

  it('refaz a sincronização ao reconectar', () => {
    const { handlers, reconnected } = setup()
    reconnected()
    expect(handlers.resync).toHaveBeenCalledOnce()
  })
})

describe('createLifecycle (StrictMode: stop no meio da negociação)', () => {
  it('espera a conexão terminar de iniciar antes de parar', async () => {
    const order: string[] = []
    let finishStart: () => void = () => undefined
    const connection = {
      start: () => new Promise<void>((resolve) => { finishStart = () => { order.push('started'); resolve() } }),
      stop: () => { order.push('stopped'); return Promise.resolve() },
    }
    const onStarted = vi.fn()
    const realtime = createLifecycle(connection, onStarted)

    const started = realtime.start()
    const stopped = realtime.stop() // desmontou durante a negociação
    finishStart()
    await Promise.all([started, stopped])

    expect(order).toEqual(['started', 'stopped'])
  })

  it('para normalmente quando não há início em andamento', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    await createLifecycle({ start: () => Promise.resolve(), stop }, () => undefined).stop()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('stop não propaga o erro de um início que falhou', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    const realtime = createLifecycle({ start: () => Promise.reject(new Error('sem rede')), stop }, () => undefined)
    const started = realtime.start().catch(() => undefined)
    await realtime.stop()
    await started
    expect(stop).toHaveBeenCalledOnce()
  })
})
