import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from './api'
import {
  dayLabel, formatTime, groupByDay, groupsApi, groupsReducer, initials, messagesReducer, validateAttachments, voiceReducer, PAGE_SIZE, reloadVoice,
  type GroupDto, type MessageDto, type MessagesState,
} from './groups'

const user = (id: string): User => ({ id, username: id, displayName: id, avatarUrl: null, bannerUrl: null })
const group = (id: string, ...memberIds: string[]): GroupDto => ({
  id, name: `Grupo ${id}`, ownerId: memberIds[0] ?? 'u1', createdAt: '2026-01-01T00:00:00Z',
  members: memberIds.map((m, i) => ({ user: user(m), presence: 'offline', isOwner: i === 0 })),
})
const message = (id: string, createdAt = '2026-05-10T12:00:00', groupId = 'g1'): MessageDto => ({
  id, groupId, author: user('u1'), text: `texto ${id}`, images: [{ url: '/media/x.webp', width: 10, height: 10 }], createdAt, deleted: false,
})
const ids = (state: MessagesState, groupId = 'g1') => state[groupId].items.map((m) => m.id)

describe('groupsReducer', () => {
  it('loaded substitui a lista', () => {
    expect(groupsReducer([group('a')], { type: 'loaded', groups: [group('b')] }).map((g) => g.id)).toEqual(['b'])
  })

  it('added entra no topo e não duplica; updated troca pelo id', () => {
    let s = groupsReducer([group('a')], { type: 'added', group: group('b') })
    s = groupsReducer(s, { type: 'added', group: group('b') })
    expect(s.map((g) => g.id)).toEqual(['b', 'a'])
    s = groupsReducer(s, { type: 'updated', group: { ...group('a'), name: 'Novo' } })
    expect(s.map((g) => g.name)).toEqual(['Grupo b', 'Novo'])
  })

  it('removed tira o grupo', () => {
    expect(groupsReducer([group('a'), group('b')], { type: 'removed', groupId: 'a' }).map((g) => g.id)).toEqual(['b'])
  })

  it('presenceChanged muda a pessoa em todos os grupos em que ela está', () => {
    const s = groupsReducer([group('a', 'u1', 'u2'), group('b', 'u3')], { type: 'presenceChanged', userId: 'u2', presence: 'online' })
    expect(s[0].members.map((m) => m.presence)).toEqual(['offline', 'online'])
    expect(s[1].members.map((m) => m.presence)).toEqual(['offline'])
  })
})

describe('messagesReducer', () => {
  const page = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => message(`m${from + i}`, new Date(2026, 4, 10, 12, 0, from + i).toISOString()))

  it('loaded guarda a página e hasMore só se ela veio cheia', () => {
    expect(messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: page(3) }).g1.hasMore).toBe(false)
    expect(messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: page(PAGE_SIZE) }).g1.hasMore).toBe(true)
  })

  it('loaded de novo (reconexão) junta com o que já existe sem duplicar', () => {
    let s = messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: page(3) })
    s = messagesReducer(s, { type: 'loaded', groupId: 'g1', messages: page(5) })
    expect(ids(s)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4'])
  })

  it('loaded cheia que não encosta no histórico (buraco) fica só com a página nova', () => {
    let s = messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: page(3) })
    s = messagesReducer(s, { type: 'loaded', groupId: 'g1', messages: page(PAGE_SIZE, 100) })
    expect(s.g1.items).toHaveLength(PAGE_SIZE)
    expect(s.g1.hasMore).toBe(true)
  })

  it('olderLoaded entra antes, sem duplicar, e atualiza hasMore', () => {
    let s = messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: page(PAGE_SIZE, 10) })
    s = messagesReducer(s, { type: 'olderLoaded', groupId: 'g1', messages: [...page(3, 7)] })
    expect(ids(s).slice(0, 4)).toEqual(['m7', 'm8', 'm9', 'm10'])
    expect(s.g1.hasMore).toBe(false)
  })

  it('created não duplica pelo id e mantém a ordem por data', () => {
    let s = messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: [message('a', '2026-05-10T10:00:00Z'), message('c', '2026-05-10T12:00:00Z')] })
    s = messagesReducer(s, { type: 'created', message: message('b', '2026-05-10T11:00:00Z') })
    s = messagesReducer(s, { type: 'created', message: message('b', '2026-05-10T11:00:00Z') })
    expect(ids(s)).toEqual(['a', 'b', 'c'])
  })

  it('created de um grupo não carregado é ignorado', () => {
    expect(messagesReducer({}, { type: 'created', message: message('a') })).toEqual({})
  })

  it('deleted marca como apagada e limpa texto e imagens', () => {
    let s = messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: [message('a'), message('b')] })
    s = messagesReducer(s, { type: 'deleted', groupId: 'g1', messageId: 'a' })
    expect(s.g1.items[0]).toMatchObject({ deleted: true, text: '', images: [] })
    expect(s.g1.items[1].deleted).toBe(false)
  })

  it('cleared esquece a conversa do grupo', () => {
    const s = messagesReducer({}, { type: 'loaded', groupId: 'g1', messages: [message('a')] })
    expect(messagesReducer(s, { type: 'cleared', groupId: 'g1' })).toEqual({})
  })
})

describe('initials', () => {
  it('usa até duas letras', () => {
    expect(initials('Resenha de sexta')).toBe('RS')
    expect(initials('Amigos')).toBe('AM')
  })
})

describe('datas', () => {
  const now = new Date(2026, 4, 10, 15, 30) // 10/05/2026 15:30 local

  it('formatTime usa HH:MM de 24 h no horário local', () => {
    expect(formatTime(new Date(2026, 4, 10, 9, 5).toISOString())).toBe('09:05')
    expect(formatTime(new Date(2026, 4, 10, 23, 59).toISOString())).toBe('23:59')
  })

  it('dayLabel diz HOJE, ONTEM ou dd/mm/aaaa', () => {
    expect(dayLabel(new Date(2026, 4, 10, 0, 1).toISOString(), now)).toBe('HOJE')
    expect(dayLabel(new Date(2026, 4, 9, 23, 59).toISOString(), now)).toBe('ONTEM')
    expect(dayLabel(new Date(2026, 4, 8, 12, 0).toISOString(), now)).toBe('08/05/2026')
  })

  it('dayLabel de ontem vale na virada do mês', () => {
    expect(dayLabel(new Date(2026, 3, 30, 12, 0).toISOString(), new Date(2026, 4, 1, 8, 0))).toBe('ONTEM')
  })

  it('groupByDay separa por dia local mantendo a ordem', () => {
    const at = (id: string, d: number, h: number) => message(id, new Date(2026, 4, d, h).toISOString())
    const days = groupByDay([at('a', 9, 10), at('b', 9, 23), at('c', 10, 8)], now)
    expect(days.map((d) => [d.label, d.messages.map((m) => m.id)])).toEqual([['ONTEM', ['a', 'b']], ['HOJE', ['c']]])
  })
})

describe('validateAttachments', () => {
  const img = (size = 1000, type = 'image/png') => ({ type, size })

  it('aceita até 4 imagens de até 10 MB', () => {
    expect(validateAttachments([])).toBeNull()
    expect(validateAttachments([img(), img(), img(), img(10 * 1024 * 1024)])).toBeNull()
  })

  it('recusa mais de 4, o que não é imagem e arquivo grande', () => {
    expect(validateAttachments(Array.from({ length: 5 }, () => img()))).toBe('Dá para anexar no máximo 4 imagens por mensagem.')
    expect(validateAttachments([img(1, 'application/pdf')])).toBe('Só dá para anexar imagens.')
    expect(validateAttachments([img(10 * 1024 * 1024 + 1)])).toBe('Cada imagem pode ter no máximo 10 MB.')
  })
})

describe('chamadas de grupos', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (response: Response) => {
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('getGroups usa GET /groups com o token', async () => {
    const fetchMock = stubFetch(json(200, []))
    await groupsApi.getGroups('tok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/groups$/)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('createGroup e renameGroup mandam JSON', async () => {
    const fetchMock = stubFetch(json(201, group('g1')))
    await groupsApi.createGroup('tok', 'Sexta', ['u2'])
    fetchMock.mockResolvedValue(json(200, group('g1')))
    await groupsApi.renameGroup('tok', 'g1', 'Outro')
    const [[url1, init1], [url2, init2]] = fetchMock.mock.calls
    expect([init1.method, String(url1).endsWith('/groups'), JSON.parse(init1.body)]).toEqual(['POST', true, { name: 'Sexta', memberIds: ['u2'] }])
    expect([init2.method, String(url2).endsWith('/groups/g1'), JSON.parse(init2.body)]).toEqual(['PATCH', true, { name: 'Outro' }])
  })

  it('addMembers e removeMember usam as rotas de membros (204 sem corpo)', async () => {
    const fetchMock = stubFetch(json(200, group('g1')))
    await groupsApi.addMembers('tok', 'g1', ['u2', 'u3'])
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(groupsApi.removeMember('tok', 'g1', 'u2')).resolves.toBeUndefined()
    const [[url1, init1], [url2, init2]] = fetchMock.mock.calls
    expect([init1.method, String(url1).endsWith('/groups/g1/members'), JSON.parse(init1.body)]).toEqual(['POST', true, { userIds: ['u2', 'u3'] }])
    expect([init2.method, String(url2).endsWith('/groups/g1/members/u2')]).toEqual(['DELETE', true])
  })

  it('getMessages manda limit e, se houver, before', async () => {
    const fetchMock = stubFetch(json(200, []))
    await groupsApi.getMessages('tok', 'g1')
    fetchMock.mockResolvedValue(json(200, []))
    await groupsApi.getMessages('tok', 'g1', 'm9')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/groups\/g1\/messages\?limit=50$/)
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/groups\/g1\/messages\?limit=50&before=m9$/)
  })

  it('sendMessage monta FormData com text e images, sem Content-Type manual', async () => {
    const fetchMock = stubFetch(json(201, message('m1')))
    const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]
    await groupsApi.sendMessage('tok', 'g1', 'oi', files)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/groups\/g1\/messages$/)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBeUndefined()
    const body = init.body as FormData
    expect(body.get('text')).toBe('oi')
    expect(body.getAll('images')).toHaveLength(2)
  })

  it('deleteMessage usa DELETE', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))
    await groupsApi.deleteMessage('tok', 'g1', 'm1')
    const [url, init] = fetchMock.mock.calls[0]
    expect([init.method, String(url).endsWith('/groups/g1/messages/m1')]).toEqual(['DELETE', true])
  })

  it('mostra o título do erro da API', async () => {
    stubFetch(json(403, { title: 'Só o dono do grupo pode renomear.' }))
    await expect(groupsApi.renameGroup('tok', 'g1', 'x')).rejects.toMatchObject({ message: 'Só o dono do grupo pode renomear.', status: 403 })
  })
})

describe('sala de voz do grupo', () => {
  it('voiceReducer guarda quem está na sala e remove a chave quando esvazia', () => {
    let s = voiceReducer({}, { groupId: 'g1', userIds: ['a', 'b'] })
    s = voiceReducer(s, { groupId: 'g2', userIds: ['c'] })
    expect(s).toEqual({ g1: ['a', 'b'], g2: ['c'] })
    expect(voiceReducer(s, { groupId: 'g1', userIds: [] })).toEqual({ g2: ['c'] })
  })

  it('groupsApi.getVoice e voiceToken usam as rotas do grupo', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ userIds: ['a'] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await groupsApi.getVoice('tok', 'g1')).toEqual({ userIds: ['a'] })
    await groupsApi.voiceToken('tok', 'g1')
    vi.unstubAllGlobals()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/groups\/g1\/voice$/)
    expect(fetchMock.mock.calls[0][1].method).toBe('GET')
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/groups\/g1\/voice\/token$/)
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  })

  it('reloadVoice busca a sala de cada grupo e ignora o que falhar', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      String(url).includes('/g2/') ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ userIds: ['a'] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const applied: [string, string[]][] = []
    await reloadVoice('tok', new Set(['g1', 'g2', 'g3']), (groupId, userIds) => applied.push([groupId, userIds]))
    vi.unstubAllGlobals()
    expect(applied).toEqual([['g1', ['a']], ['g3', ['a']]])
  })
})
