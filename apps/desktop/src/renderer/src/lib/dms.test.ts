import { describe, expect, it, vi } from 'vitest'
import type { User } from './api'
import {
  conversationsReducer, loadUnread, parseUnread, previewText, readOnlyNotice, saveUnread, sidebarConversations, totalUnread, unreadReducer,
  type DirectConversationDto, type DirectMessageDto, type UnreadState,
} from './dms'

const user = (id: string): User => ({ id, username: id, displayName: `Pessoa ${id}`, avatarUrl: null, bannerUrl: null })

const msg = (id: string, conversationId: string, author: string, createdAt: string, extra: Partial<DirectMessageDto> = {}): DirectMessageDto => ({
  id, conversationId, author: user(author), text: `texto ${id}`, images: [], createdAt, deleted: false, ...extra,
})

const conv = (id: string, other: string, last: DirectMessageDto | null, extra: Partial<DirectConversationDto> = {}): DirectConversationDto => ({
  id, user: user(other), canSend: true, lastMessage: last, createdAt: '2026-11-01T00:00:00Z', ...extra,
})

describe('previewText', () => {
  it('mostra o texto (numa linha só) e "Você:" nas minhas', () => {
    expect(previewText(msg('1', 'c', 'bia', '2026-11-20T10:00:00Z', { text: 'oi\ntudo bem?' }), 'eu')).toBe('oi tudo bem?')
    expect(previewText(msg('1', 'c', 'eu', '2026-11-20T10:00:00Z', { text: 'amanhã eu levo' }), 'eu')).toBe('Você: amanhã eu levo')
  })

  it('só imagem vira "📷 Imagem"', () => {
    const image = { url: '/media/x.webp', width: 1, height: 1 }
    expect(previewText(msg('1', 'c', 'bia', '2026-11-20T10:00:00Z', { text: '', images: [image] }), 'eu')).toBe('📷 Imagem')
    expect(previewText(msg('1', 'c', 'eu', '2026-11-20T10:00:00Z', { text: '  ', images: [image] }), 'eu')).toBe('Você: 📷 Imagem')
  })

  it('apagada e conversa sem mensagem', () => {
    expect(previewText(msg('1', 'c', 'eu', '2026-11-20T10:00:00Z', { deleted: true, text: '' }), 'eu')).toBe('Mensagem apagada')
    expect(previewText(null, 'eu')).toBe('Nova conversa')
  })
})

describe('sidebarConversations', () => {
  it('ordena pela mais recente e esconde as sem mensagem (menos a aberta)', () => {
    const list = [
      conv('a', 'bia', msg('1', 'a', 'bia', '2026-11-20T09:00:00Z')),
      conv('vazia', 'leo', null, { createdAt: '2026-11-20T11:00:00Z' }),
      conv('b', 'duda', msg('2', 'b', 'duda', '2026-11-20T10:00:00Z')),
    ]
    expect(sidebarConversations(list, null).map((c) => c.id)).toEqual(['b', 'a'])
    expect(sidebarConversations(list, 'vazia').map((c) => c.id)).toEqual(['vazia', 'b', 'a'])
  })
})

describe('readOnlyNotice', () => {
  it('só aparece quando não dá para enviar', () => {
    expect(readOnlyNotice({ canSend: true })).toBeNull()
    expect(readOnlyNotice({ canSend: false })).toMatch(/só para leitura/)
  })
})

describe('conversationsReducer', () => {
  it('nova mensagem vira a última; uma mais antiga não troca', () => {
    let s = [conv('a', 'bia', msg('1', 'a', 'bia', '2026-11-20T09:00:00Z'))]
    s = conversationsReducer(s, { type: 'messageCreated', message: msg('2', 'a', 'eu', '2026-11-20T10:00:00Z') })
    expect(s[0].lastMessage?.id).toBe('2')
    s = conversationsReducer(s, { type: 'messageCreated', message: msg('0', 'a', 'bia', '2026-11-20T08:00:00Z') })
    expect(s[0].lastMessage?.id).toBe('2')
  })

  it('upsert atrasado não esconde mensagem mais nova que já chegou', () => {
    let s = [conv('a', 'bia', msg('2', 'a', 'bia', '2026-11-20T10:00:00Z'))]
    s = conversationsReducer(s, { type: 'upserted', conversation: conv('a', 'bia', msg('1', 'a', 'bia', '2026-11-20T09:00:00Z'), { canSend: false }) })
    expect(s[0].lastMessage?.id).toBe('2')
    expect(s[0].canSend).toBe(false)
  })

  it('apagar a última mensagem muda a prévia; apagar outra não mexe', () => {
    const s = [conv('a', 'bia', msg('2', 'a', 'bia', '2026-11-20T10:00:00Z'))]
    expect(conversationsReducer(s, { type: 'messageDeleted', conversationId: 'a', messageId: '1' })).toEqual(s)
    expect(conversationsReducer(s, { type: 'messageDeleted', conversationId: 'a', messageId: '2' })[0].lastMessage).toMatchObject({ deleted: true, text: '' })
  })

  it('amizade desfeita/refeita muda canSend da conversa com a pessoa', () => {
    let s = [conv('a', 'bia', null), conv('b', 'leo', null)]
    s = conversationsReducer(s, { type: 'friendship', userId: 'bia', canSend: false })
    expect(s.map((c) => c.canSend)).toEqual([false, true])
    s = conversationsReducer(s, { type: 'friendship', userId: 'bia', canSend: true })
    expect(s[0].canSend).toBe(true)
  })

  it('recarregar a lista mantém a conversa recém-aberta (vazia)', () => {
    const s = [conv('vazia', 'leo', null), conv('a', 'bia', msg('1', 'a', 'bia', '2026-11-20T09:00:00Z'))]
    const loaded = conversationsReducer(s, { type: 'loaded', conversations: [conv('b', 'duda', msg('3', 'b', 'duda', '2026-11-20T10:00:00Z'))] })
    expect(loaded.map((c) => c.id)).toEqual(['b', 'vazia'])
  })
})

describe('unreadReducer', () => {
  const received = (state: UnreadState, message: DirectMessageDto, openId: string | null = null) =>
    unreadReducer(state, { type: 'received', message, meId: 'eu', openId })

  it('conta as dos outros, ignora repetidas, e zera ao abrir', () => {
    let s = received({}, msg('1', 'a', 'bia', '2026-11-20T09:00:00Z'))
    s = received(s, msg('2', 'a', 'bia', '2026-11-20T09:01:00Z'))
    s = received(s, msg('2', 'a', 'bia', '2026-11-20T09:01:00Z'))
    expect(s.a.count).toBe(2)
    s = unreadReducer(s, { type: 'opened', conversationId: 'a', at: '2026-11-20T09:01:00Z' })
    expect(s.a.count).toBe(0)
  })

  it('a minha e a da conversa aberta não contam', () => {
    let s = received({}, msg('1', 'a', 'eu', '2026-11-20T09:00:00Z'))
    s = received(s, msg('2', 'a', 'bia', '2026-11-20T09:01:00Z'), 'a')
    expect(s.a.count).toBe(0)
    // ...e responder zera o que estava pendente.
    s = received(s, msg('3', 'a', 'bia', '2026-11-20T09:02:00Z'))
    s = received(s, msg('4', 'a', 'eu', '2026-11-20T09:03:00Z'))
    expect(s.a.count).toBe(0)
  })

  it('abrir uma conversa nova sem mensagens não impede contar a próxima', () => {
    let s = unreadReducer({}, { type: 'opened', conversationId: 'a', at: null })
    s = received(s, msg('1', 'a', 'bia', '2026-11-20T09:00:00Z'))
    expect(s.a.count).toBe(1)
  })

  it('ao sincronizar, o que chegou com o app fechado conta pelo menos uma', () => {
    const start: UnreadState = { a: { count: 0, readAt: '2026-11-20T09:00:00Z' }, b: { count: 0, readAt: '2026-11-20T09:00:00Z' } }
    const s = unreadReducer(start, {
      type: 'synced', meId: 'eu', openId: null, conversations: [
        conv('a', 'bia', msg('5', 'a', 'bia', '2026-11-20T12:00:00Z')),
        conv('b', 'leo', msg('6', 'b', 'leo', '2026-11-20T09:00:00Z')), // já vista
        conv('c', 'duda', msg('7', 'c', 'duda', '2026-11-20T12:00:00Z')), // conversa nova
        conv('d', 'nina', msg('8', 'd', 'eu', '2026-11-20T12:00:00Z')), // a última é minha
      ],
    })
    expect(s.a.count).toBe(1)
    expect(s.b).toBe(start.b)
    expect(s.c.count).toBe(1)
    expect(s.d.count).toBe(0)
    expect(totalUnread(s)).toBe(2)
  })
})

describe('persistência das não lidas', () => {
  it('ignora dado corrompido ou fora do formato', () => {
    expect(parseUnread(null)).toEqual({})
    expect(parseUnread('{quebrado')).toEqual({})
    expect(parseUnread('[1,2]')).toEqual({})
    expect(parseUnread(JSON.stringify({ a: { count: 2, readAt: 'x' }, b: { count: -1, readAt: 'x' }, c: 'oi' }))).toEqual({ a: { count: 2, readAt: 'x' } })
  })

  it('salva e lê por conta; storage com erro não quebra', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    saveUnread('eu', { a: { count: 3, readAt: '2026-11-20T09:00:00Z' } }, storage)
    expect(loadUnread('eu', storage)).toEqual({ a: { count: 3, readAt: '2026-11-20T09:00:00Z' } })
    expect(loadUnread('outra', storage)).toEqual({})
    const broken = { getItem: vi.fn(() => { throw new Error('bloqueado') }), setItem: vi.fn(() => { throw new Error('cheio') }) }
    expect(loadUnread('eu', broken)).toEqual({})
    expect(() => saveUnread('eu', {}, broken)).not.toThrow()
  })
})
