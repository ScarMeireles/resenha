import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from './api'
import {
  checkUsername, emptyFriends, friendsApi, friendsReducer, isOnline, normalizeUsername, sortFriends,
  type FriendDto, type FriendRequestDto, type FriendsState,
} from './friends'

const user = (id: string, displayName = id): User => ({ id, username: id, displayName, avatarUrl: null, bannerUrl: null })
const friend = (id: string, presence: FriendDto['presence'] = 'offline', displayName = id): FriendDto =>
  ({ user: user(id, displayName), presence, since: '2026-01-01T00:00:00Z' })
const req = (id: string, userId: string): FriendRequestDto => ({ id, user: user(userId), createdAt: '2026-01-01T00:00:00Z' })

describe('friendsReducer', () => {
  it('loaded substitui tudo', () => {
    const data: FriendsState = { friends: [friend('a')], incoming: [req('r1', 'b')], outgoing: [] }
    expect(friendsReducer(emptyFriends, { type: 'loaded', data })).toEqual(data)
  })

  it('requestReceived e requestSent adicionam sem duplicar', () => {
    let s = friendsReducer(emptyFriends, { type: 'requestReceived', request: req('r1', 'b') })
    s = friendsReducer(s, { type: 'requestReceived', request: req('r1', 'b') })
    s = friendsReducer(s, { type: 'requestSent', request: req('r2', 'c') })
    s = friendsReducer(s, { type: 'requestSent', request: req('r2', 'c') })
    expect(s.incoming).toHaveLength(1)
    expect(s.outgoing).toHaveLength(1)
  })

  it('requestRemoved tira o pedido recebido ou enviado', () => {
    const s0: FriendsState = { friends: [], incoming: [req('r1', 'b')], outgoing: [req('r2', 'c')] }
    expect(friendsReducer(s0, { type: 'requestRemoved', id: 'r1' }).incoming).toEqual([])
    expect(friendsReducer(s0, { type: 'requestRemoved', id: 'r2' }).outgoing).toEqual([])
  })

  it('friendAdded adiciona, não duplica e limpa os pedidos daquela pessoa', () => {
    const s0: FriendsState = { friends: [], incoming: [req('r1', 'b')], outgoing: [req('r2', 'b'), req('r3', 'c')] }
    let s = friendsReducer(s0, { type: 'friendAdded', friend: friend('b') })
    s = friendsReducer(s, { type: 'friendAdded', friend: friend('b', 'online') })
    expect(s.friends).toHaveLength(1)
    expect(s.friends[0].presence).toBe('online')
    expect(s.incoming).toEqual([])
    expect(s.outgoing.map((r) => r.id)).toEqual(['r3'])
  })

  it('friendRemoved tira o amigo', () => {
    const s0: FriendsState = { friends: [friend('a'), friend('b')], incoming: [], outgoing: [] }
    expect(friendsReducer(s0, { type: 'friendRemoved', userId: 'a' }).friends.map((f) => f.user.id)).toEqual(['b'])
  })

  it('presenceChanged muda só o amigo certo', () => {
    const s0: FriendsState = { friends: [friend('a'), friend('b')], incoming: [], outgoing: [] }
    const s = friendsReducer(s0, { type: 'presenceChanged', userId: 'b', presence: 'online' })
    expect(s.friends.map((f) => f.presence)).toEqual(['offline', 'online'])
  })

  it('userUpdated troca os dados da pessoa em amigos e pedidos, mantendo a presença', () => {
    const s0: FriendsState = { friends: [friend('a', 'online'), friend('b')], incoming: [req('r1', 'a')], outgoing: [req('r2', 'c')] }
    const renamed = { ...user('a', 'Nome Novo'), username: 'novo' }
    const s = friendsReducer(s0, { type: 'userUpdated', user: renamed })
    expect(s.friends[0]).toEqual({ ...s0.friends[0], user: renamed })
    expect(s.friends[1]).toBe(s0.friends[1])
    expect(s.incoming[0].user).toEqual(renamed)
    expect(s.outgoing).toBe(s0.outgoing)
  })
})

describe('sortFriends', () => {
  it('põe online primeiro e ordena por nome em pt-BR', () => {
    const sorted = sortFriends([friend('1', 'offline', 'Zeca'), friend('2', 'online', 'Ótavio'), friend('3', 'offline', 'Ana'), friend('4', 'online', 'Bia')])
    expect(sorted.map((f) => f.user.displayName)).toEqual(['Bia', 'Ótavio', 'Ana', 'Zeca'])
  })

  it('não altera a lista original', () => {
    const list = [friend('1', 'offline', 'B'), friend('2', 'online', 'A')]
    sortFriends(list)
    expect(list[0].user.id).toBe('1')
  })
})

describe('normalizeUsername', () => {
  it('tira @, espaços e maiúsculas', () => {
    expect(normalizeUsername('  @Maria.Silva ')).toBe('maria.silva')
  })
})

describe('chamadas de amigos', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (response: Response) => {
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('getFriends usa GET /friends com o token', async () => {
    const fetchMock = stubFetch(json(200, emptyFriends))
    expect(await friendsApi.getFriends('tok')).toEqual(emptyFriends)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/friends$/)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('sendFriendRequest manda o @ no corpo', async () => {
    const fetchMock = stubFetch(json(201, req('r1', 'b')))
    await friendsApi.sendFriendRequest('tok', 'bia')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/friends\/requests$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ username: 'bia' })
  })

  it('sendFriendRequest mostra o título do erro da API', async () => {
    stubFetch(json(404, { title: 'Não achei ninguém com esse @.' }))
    await expect(friendsApi.sendFriendRequest('tok', 'x')).rejects.toMatchObject({ message: 'Não achei ninguém com esse @.', status: 404 })
  })

  it('acceptFriendRequest usa POST .../accept', async () => {
    const fetchMock = stubFetch(json(200, friend('b')))
    await friendsApi.acceptFriendRequest('tok', 'r1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/friends\/requests\/r1\/accept$/)
    expect(init.method).toBe('POST')
  })

  it('removeFriendRequest e removeFriend usam DELETE e aceitam 204', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))
    await expect(friendsApi.removeFriendRequest('tok', 'r1')).resolves.toBeUndefined()
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(friendsApi.removeFriend('tok', 'u1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, String(url).replace(/^.*(?=\/friends)/, '')]))
      .toEqual([['DELETE', '/friends/requests/r1'], ['DELETE', '/friends/u1']])
  })

  it('checkUsername codifica o @ e não manda token', async () => {
    const fetchMock = stubFetch(json(200, { available: true, error: null }))
    const signal = new AbortController().signal
    await checkUsername('a b', signal)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/auth\/username-available\?u=a%20b$/)
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.signal).toBe(signal)
  })
})

describe('presença "em chamada"', () => {
  it('conta como conectado e vem antes dos offline', () => {
    const list = sortFriends([friend('a', 'offline'), friend('b', 'in-call'), friend('c', 'online')])
    expect(list[2].presence).toBe('offline')
    expect(isOnline('in-call')).toBe(true)
    expect(isOnline('offline')).toBe(false)
  })
})
