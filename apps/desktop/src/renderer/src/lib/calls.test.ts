import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from './api'
import {
  callReducer, callsApi, initialCallState, NOTICE_MS, RING_TIMEOUT_MS, showsCallScreen, startRingTimeout, type CallAction, type CallState,
} from './calls'

const user = (id: string, displayName = id): User => ({ id, username: id, displayName, avatarUrl: null, bannerUrl: null })
const run = (actions: CallAction[], from: CallState = initialCallState) => actions.reduce(callReducer, from)

describe('ligar (1:1)', () => {
  it('ligar → chamando → atendida → ativa', () => {
    let s = run([{ type: 'dialing', friend: user('ana', 'Ana') }])
    expect(s.current).toMatchObject({ status: 'connecting', target: { kind: 'direct' } })
    s = run([{ type: 'dialed', room: 'r1' }], s)
    expect(s.current).toMatchObject({ status: 'ringing-out', room: 'r1' })
    s = run([{ type: 'accepted', room: 'r1' }], s)
    expect(s.current?.status).toBe('active')
  })

  it('recusada: encerra e avisa', () => {
    const s = run([{ type: 'dialing', friend: user('ana', 'Ana') }, { type: 'dialed', room: 'r1' }, { type: 'declined', room: 'r1' }])
    expect(s.current).toBeNull()
    expect(s.notice).toBe('Ana recusou')
  })

  it('não atendida (timeout): encerra e avisa', () => {
    const s = run([{ type: 'dialing', friend: user('ana', 'Ana') }, { type: 'dialed', room: 'r1' }, { type: 'timeout' }])
    expect(s.current).toBeNull()
    expect(s.notice).toBe('Ana não atendeu')
  })

  it('eventos de outra sala são ignorados', () => {
    const s0 = run([{ type: 'dialing', friend: user('ana') }, { type: 'dialed', room: 'r1' }])
    expect(run([{ type: 'accepted', room: 'outra' }, { type: 'declined', room: 'outra' }, { type: 'ended', room: 'outra' }], s0)).toEqual(s0)
  })

  it('falha ao ligar mostra a mensagem do servidor', () => {
    const s = run([{ type: 'dialing', friend: user('ana') }, { type: 'failed', message: 'Ana está offline' }])
    expect(s.current).toBeNull()
    expect(s.notice).toBe('Ana está offline')
  })
})

describe('ligação recebida', () => {
  const incoming: CallAction = { type: 'incoming', call: { room: 'r9', from: user('bia', 'Bia') } }

  it('mostra o card e atender entra na chamada', () => {
    let s = run([incoming])
    expect(s.incoming?.from.displayName).toBe('Bia')
    s = run([{ type: 'acceptStarted', room: 'r9', from: user('bia', 'Bia') }], s)
    expect(s.incoming).toBeNull()
    expect(s.current).toMatchObject({ status: 'connecting', room: 'r9' })
    expect(run([{ type: 'answered' }], s).current?.status).toBe('active')
  })

  it('recusar some com o card', () => {
    expect(run([incoming, { type: 'incomingDismissed' }]).incoming).toBeNull()
  })

  it('quem ligou cancelou: o card some (só da mesma sala)', () => {
    expect(run([incoming, { type: 'cancelled', room: 'r9' }]).incoming).toBeNull()
    expect(run([incoming, { type: 'cancelled', room: 'x' }]).incoming).not.toBeNull()
  })

  it('o card aparece mesmo com outra chamada em andamento e atender troca de chamada', () => {
    let s = run([{ type: 'groupJoining', groupId: 'g1' }, { type: 'groupConnected' }, incoming])
    expect(s.current?.target).toEqual({ kind: 'group', groupId: 'g1' })
    expect(s.incoming).not.toBeNull()
    s = run([{ type: 'acceptStarted', room: 'r9', from: user('bia', 'Bia') }], s)
    expect(s.current?.target.kind).toBe('direct')
  })
})

describe('chamada de grupo e encerramento', () => {
  it('entrar no grupo: conectando → ativa; entrar em outra sala substitui', () => {
    let s = run([{ type: 'groupJoining', groupId: 'g1' }])
    expect(s.current?.status).toBe('connecting')
    s = run([{ type: 'groupConnected' }], s)
    expect(s.current?.status).toBe('active')
    s = run([{ type: 'groupJoining', groupId: 'g2' }], s)
    expect(s.current?.target).toEqual({ kind: 'group', groupId: 'g2' })
  })

  it('callEnded encerra a chamada da sala e avisa', () => {
    const s = run([{ type: 'dialing', friend: user('ana') }, { type: 'dialed', room: 'r1' }, { type: 'accepted', room: 'r1' }, { type: 'ended', room: 'r1' }])
    expect(s.current).toBeNull()
    expect(s.notice).toBe('Chamada encerrada')
  })

  it('aviso avulso mantém a chamada e os demais dados', () => {
    const before = run([{ type: 'groupJoining', groupId: 'g1' }])
    const after = callReducer(before, { type: 'notice', message: 'x' })
    expect(after).toEqual({ ...before, notice: 'x' })
  })

  it('sair limpa a chamada e o aviso some', () => {
    expect(run([{ type: 'groupJoining', groupId: 'g1' }, { type: 'left' }]).current).toBeNull()
    expect(run([{ type: 'failed', message: 'x' }, { type: 'noticeCleared' }]).notice).toBeNull()
  })
})

describe('tempos', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('chama o timeout depois de 30 s', () => {
    const onTimeout = vi.fn()
    startRingTimeout(onTimeout)
    vi.advanceTimersByTime(RING_TIMEOUT_MS - 1)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('cancelar o toque impede o timeout', () => {
    const onTimeout = vi.fn()
    const cancel = startRingTimeout(onTimeout)
    cancel()
    vi.advanceTimersByTime(RING_TIMEOUT_MS * 2)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('constantes combinam com o combinado (30 s toque, 3 s aviso)', () => {
    expect(RING_TIMEOUT_MS).toBe(30_000)
    expect(NOTICE_MS).toBe(3_000)
  })
})

describe('callsApi', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status })

  it('liga com POST /calls/{id} e token', async () => {
    fetchMock.mockImplementation(async () => json(200, { url: 'wss://x', token: 't', room: 'r' }))
    expect(await callsApi.dial('tok', 'a b')).toEqual({ url: 'wss://x', token: 't', room: 'r' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/calls\/a%20b$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it.each([
    ['accept', 'accept'],
    ['decline', 'decline'],
    ['cancel', 'cancel'],
    ['hangup', 'hangup'],
  ] as const)('%s usa POST /calls/{id}/%s', async (method, path) => {
    fetchMock.mockResolvedValue(json(method === 'accept' ? 200 : 204, method === 'accept' ? { url: 'u', token: 't', room: 'r' } : undefined))
    await callsApi[method]('tok', 'f1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(new RegExp(`/calls/f1/${path}$`))
    expect(init.method).toBe('POST')
  })

  it('amigo offline (409) vira erro com a mensagem do servidor', async () => {
    fetchMock.mockResolvedValue(json(409, { title: 'Ana está offline' }))
    await expect(callsApi.dial('tok', 'ana')).rejects.toMatchObject({ message: 'Ana está offline', status: 409 })
  })
})

describe('showsCallScreen (tela da chamada x chat)', () => {
  const grupo = { kind: 'group' as const, groupId: 'g1' }
  const direta = { kind: 'direct' as const, friend: user('ana') }

  it('sem chamada, nunca mostra', () => {
    expect(showsCallScreen(true, null)).toBe(false)
  })

  it('com a chamada ativa, voltar ao chat (viewing = false) esconde a tela sem exigir sair', () => {
    expect(showsCallScreen(true, { target: grupo, status: 'active', room: 'r' })).toBe(true)
    expect(showsCallScreen(false, { target: grupo, status: 'active', room: 'r' })).toBe(false)
  })

  it('grupo conectando já mostra a sala; 1:1 chamando não', () => {
    expect(showsCallScreen(true, { target: grupo, status: 'connecting' })).toBe(true)
    expect(showsCallScreen(true, { target: direta, status: 'connecting' })).toBe(false)
    expect(showsCallScreen(true, { target: direta, status: 'ringing-out', room: 'r' })).toBe(false)
  })
})
