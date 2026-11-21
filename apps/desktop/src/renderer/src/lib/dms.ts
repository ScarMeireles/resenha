import { request, type User } from './api'
import { PAGE_SIZE, type ChatMessage } from './groups'
import { replaceUser } from './users'

/** Tipos, chamadas e estado das mensagens diretas (DMs). Espelham server/api (DirectConversationDto, DirectMessageDto). */

export interface DirectMessageDto extends ChatMessage {
  conversationId: string
}

/** `user` é sempre a OUTRA pessoa. `canSend` fica false quando vocês deixaram de ser amigos (histórico só leitura). */
export interface DirectConversationDto {
  id: string
  user: User
  canSend: boolean
  lastMessage: DirectMessageDto | null
  createdAt: string
}

const enc = encodeURIComponent

export const dmsApi = {
  /** Conversas com pelo menos uma mensagem, a mais recente primeiro. */
  list: (token: string) => request<DirectConversationDto[]>('GET', '/dms', { token }),

  /** Abre (ou devolve, se já existe) a conversa com um amigo. */
  open: (token: string, userId: string) => request<DirectConversationDto>('POST', '/dms', { token, json: { userId } }),

  get: (token: string, id: string) => request<DirectConversationDto>('GET', `/dms/${enc(id)}`, { token }),

  /** Mensagens em ordem cronológica. `before` = id da mensagem mais antiga que você já tem. */
  getMessages: (token: string, id: string, before?: string, limit = PAGE_SIZE) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (before) query.set('before', before)
    return request<DirectMessageDto[]>('GET', `/dms/${enc(id)}/messages?${query}`, { token })
  },

  sendMessage: (token: string, id: string, text: string, images: File[]) => {
    const body = new FormData()
    body.append('text', text)
    for (const image of images) body.append('images', image)
    return request<DirectMessageDto>('POST', `/dms/${enc(id)}/messages`, { token, body })
  },

  deleteMessage: (token: string, id: string, messageId: string) =>
    request<void>('DELETE', `/dms/${enc(id)}/messages/${enc(messageId)}`, { token }),
}

// --- Lista de conversas ---

export type ConversationsAction =
  | { type: 'loaded'; conversations: DirectConversationDto[] }
  | { type: 'upserted'; conversation: DirectConversationDto }
  | { type: 'messageCreated'; message: DirectMessageDto }
  | { type: 'messageDeleted'; conversationId: string; messageId: string }
  | { type: 'friendship'; userId: string; canSend: boolean }
  /** Alguém mudou nome, foto, banner ou @. */
  | { type: 'userUpdated'; user: User }

const time = (iso: string) => Date.parse(iso)

/** A mais nova das duas (a que chegou por último vence o empate: pode ser a mesma mensagem atualizada). */
function newer(a: DirectMessageDto | null, b: DirectMessageDto | null): DirectMessageDto | null {
  if (!a) return b
  if (!b) return a
  return time(b.createdAt) >= time(a.createdAt) ? b : a
}

/** Insere ou troca pelo id. Não deixa uma resposta HTTP atrasada esconder uma mensagem mais nova que já chegou por evento. */
function upsert(list: DirectConversationDto[], conversation: DirectConversationDto): DirectConversationDto[] {
  const current = list.find((c) => c.id === conversation.id)
  if (!current) return [...list, conversation]
  const merged = { ...conversation, lastMessage: newer(current.lastMessage, conversation.lastMessage) }
  return list.map((c) => (c.id === conversation.id ? merged : c))
}

export function conversationsReducer(state: DirectConversationDto[], action: ConversationsAction): DirectConversationDto[] {
  switch (action.type) {
    case 'loaded': {
      // A API só lista conversas com mensagem; a que acabei de abrir (ainda vazia) continua aqui.
      const ids = new Set(action.conversations.map((c) => c.id))
      const emptyOnes = state.filter((c) => !c.lastMessage && !ids.has(c.id))
      return [...action.conversations, ...emptyOnes]
    }
    case 'upserted':
      return upsert(state, action.conversation)
    case 'messageCreated': {
      const { message } = action
      return state.map((c) => (c.id === message.conversationId ? { ...c, lastMessage: newer(c.lastMessage, message) } : c))
    }
    case 'messageDeleted':
      return state.map((c) =>
        c.id === action.conversationId && c.lastMessage?.id === action.messageId
          ? { ...c, lastMessage: { ...c.lastMessage, deleted: true, text: '', images: [] } }
          : c,
      )
    case 'friendship':
      return state.map((c) => (c.user.id === action.userId && c.canSend !== action.canSend ? { ...c, canSend: action.canSend } : c))
    case 'userUpdated': {
      // A outra pessoa da conversa e o autor da prévia (que pode ser eu).
      const { user } = action
      const withUser = replaceUser(state, user)
      if (!withUser.some((c) => c.lastMessage?.author.id === user.id)) return withUser
      return withUser.map((c) => (c.lastMessage?.author.id === user.id ? { ...c, lastMessage: { ...c.lastMessage, author: user } } : c))
    }
  }
}

/** Momento usado para ordenar: a última mensagem ou, sem mensagem, quando a conversa foi criada. */
const activityAt = (c: DirectConversationDto) => time(c.lastMessage?.createdAt ?? c.createdAt)

/**
 * O que aparece na barra lateral: conversas com mensagem, a mais recente primeiro.
 * A conversa aberta entra mesmo vazia (acabou de abrir pelo "Mensagem"); some se você sair sem escrever.
 */
export function sidebarConversations(list: DirectConversationDto[], openId: string | null): DirectConversationDto[] {
  return list.filter((c) => c.lastMessage || c.id === openId).sort((a, b) => activityAt(b) - activityAt(a))
}

/** Prévia da última mensagem na barra lateral. */
export function previewText(message: DirectMessageDto | null, meId: string): string {
  if (!message) return 'Nova conversa'
  if (message.deleted) return 'Mensagem apagada'
  const body = message.text.trim() !== '' ? message.text.replace(/\s+/g, ' ').trim() : '📷 Imagem'
  return message.author.id === meId ? `Você: ${body}` : body
}

/** Aviso do campo de envio quando a conversa ficou só para leitura; null se dá para enviar. */
export const readOnlyNotice = (conversation: Pick<DirectConversationDto, 'canSend'>): string | null =>
  conversation.canSend ? null : 'Vocês não são mais amigos. A conversa fica só para leitura até voltarem a ser amigos.'

// --- Não lidas (controle só no cliente, guardado no próprio computador) ---

export interface UnreadEntry {
  count: number
  /** Data da última mensagem já vista ou contada (para não contar duas vezes). */
  readAt: string
}

/** id da conversa → não lidas. */
export type UnreadState = Record<string, UnreadEntry>

export type UnreadAction =
  /** Abriu a conversa: zera. `at` = data da última mensagem que está na tela (null se ainda não há). */
  | { type: 'opened'; conversationId: string; at: string | null }
  /** Chegou mensagem em tempo real. */
  | { type: 'received'; message: DirectMessageDto; meId: string; openId: string | null }
  /** Lista carregada da API (ao conectar/reconectar): pega o que chegou com o app fechado. */
  | { type: 'synced'; conversations: DirectConversationDto[]; meId: string; openId: string | null }

/** `a` é depois de `b`? Sem `b` (nunca vi nada) conta como depois. */
function later(a: string, b: string | undefined): boolean {
  const seen = b ? time(b) : NaN
  return Number.isNaN(seen) || time(a) > seen
}

export function unreadReducer(state: UnreadState, action: UnreadAction): UnreadState {
  switch (action.type) {
    case 'opened': {
      const current = state[action.conversationId]
      const readAt = action.at ?? current?.readAt ?? ''
      if (current && current.count === 0 && current.readAt === readAt) return state
      return { ...state, [action.conversationId]: { count: 0, readAt } }
    }
    case 'received': {
      const { message, meId, openId } = action
      const id = message.conversationId
      const current = state[id]
      if (!later(message.createdAt, current?.readAt)) return state // repetida ou mais antiga que o que já vi
      const seen = message.author.id === meId || id === openId
      return { ...state, [id]: { count: seen ? 0 : (current?.count ?? 0) + 1, readAt: message.createdAt } }
    }
    case 'synced': {
      let next = state
      for (const c of action.conversations) {
        const last = c.lastMessage
        const current = next[c.id]
        if (!last || !later(last.createdAt, current?.readAt)) continue
        const before = current?.count ?? 0
        // Aberta ou a última é minha: já vi. Apagada: não conta. Senão não dá para saber quantas chegaram
        // com o app fechado, então conta pelo menos mais uma.
        const count = c.id === action.openId || last.author.id === action.meId ? 0 : last.deleted ? before : before + 1
        next = { ...next, [c.id]: { count, readAt: last.createdAt } }
      }
      return next
    }
  }
}

/** Soma das não lidas (para o aviso no botão do Início). */
export const totalUnread = (state: UnreadState): number => Object.values(state).reduce((sum, e) => sum + e.count, 0)

const storageKey = (meId: string) => `resenha.dms.unread.${meId}`

/** Lê o que foi salvo, descartando qualquer coisa fora do formato (arquivo mexido, versão antiga). */
export function parseUnread(raw: string | null): UnreadState {
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const result: UnreadState = {}
    for (const [id, entry] of Object.entries(data as Record<string, unknown>)) {
      const e = entry as Partial<UnreadEntry> | null
      if (e && Number.isInteger(e.count) && (e.count as number) >= 0 && typeof e.readAt === 'string')
        result[id] = { count: e.count as number, readAt: e.readAt }
    }
    return result
  } catch {
    return {}
  }
}

export function loadUnread(meId: string, storage: Pick<Storage, 'getItem'> = localStorage): UnreadState {
  try {
    return parseUnread(storage.getItem(storageKey(meId)))
  } catch {
    return {}
  }
}

export function saveUnread(meId: string, state: UnreadState, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(storageKey(meId), JSON.stringify(state))
  } catch {
    // sem espaço ou bloqueado: as não lidas só não sobrevivem a fechar o app
  }
}
