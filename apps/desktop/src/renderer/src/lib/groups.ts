import { request, type User } from './api'
import type { Presence } from './presence'

/** Tipos, chamadas e estado de grupos e mensagens. Espelham server/api (GroupDto, MessageDto...). */

export { initialsOf as initials } from './avatar'

export const MAX_GROUP_MEMBERS = 10
export const MAX_GROUP_NAME = 40
export const MAX_MESSAGE_LENGTH = 2000
export const MAX_ATTACHMENTS = 4
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
/** Tamanho da página de mensagens; página cheia = pode ter mais antigas. */
export const PAGE_SIZE = 50

export interface GroupMemberDto {
  user: User
  presence: Presence
  isOwner: boolean
}

export interface GroupDto {
  id: string
  name: string
  ownerId: string
  members: GroupMemberDto[]
  createdAt: string
}

export interface MessageImageDto {
  /** Relativa à API: use mediaUrl. */
  url: string
  width: number
  height: number
}

export interface MessageDto {
  id: string
  groupId: string
  author: User
  text: string
  images: MessageImageDto[]
  createdAt: string
  deleted: boolean
}

/** Resposta dos endpoints que liberam entrada numa sala de voz. */
export interface VoiceCredentialsDto {
  url: string
  token: string
  room: string
}

/** Quem está na sala de voz de cada grupo (id do grupo → ids dos usuários). */
export type VoiceState = Record<string, string[]>

export function voiceReducer(state: VoiceState, action: { groupId: string; userIds: string[] }): VoiceState {
  if (action.userIds.length === 0) {
    const { [action.groupId]: _removed, ...rest } = state
    return rest
  }
  return { ...state, [action.groupId]: action.userIds }
}

/**
 * Recarrega a sala de voz de cada grupo da lista (usado depois de reconectar o SignalR, quando eventos podem ter sido perdidos).
 * Falha de rede em um grupo não atrapalha os outros: o próximo resync tenta de novo.
 */
export async function reloadVoice(
  token: string, groupIds: Iterable<string>, apply: (groupId: string, userIds: string[]) => void,
): Promise<void> {
  await Promise.allSettled(
    [...groupIds].map(async (groupId) => apply(groupId, (await groupsApi.getVoice(token, groupId)).userIds)),
  )
}

const enc = encodeURIComponent

export const groupsApi = {
  getGroups: (token: string) => request<GroupDto[]>('GET', '/groups', { token }),

  /** Quem está na sala de voz do grupo agora. */
  getVoice: (token: string, id: string) => request<{ userIds: string[] }>('GET', `/groups/${enc(id)}/voice`, { token }),

  /** Credenciais do LiveKit para entrar na sala de voz do grupo. */
  voiceToken: (token: string, id: string) => request<VoiceCredentialsDto>('POST', `/groups/${enc(id)}/voice/token`, { token }),

  getGroup: (token: string, id: string) => request<GroupDto>('GET', `/groups/${enc(id)}`, { token }),

  createGroup: (token: string, name: string, memberIds: string[]) =>
    request<GroupDto>('POST', '/groups', { token, json: { name, memberIds } }),

  renameGroup: (token: string, id: string, name: string) =>
    request<GroupDto>('PATCH', `/groups/${enc(id)}`, { token, json: { name } }),

  addMembers: (token: string, id: string, userIds: string[]) =>
    request<GroupDto>('POST', `/groups/${enc(id)}/members`, { token, json: { userIds } }),

  /** O próprio id = sair do grupo; outro id = remover (só o dono). */
  removeMember: (token: string, id: string, userId: string) =>
    request<void>('DELETE', `/groups/${enc(id)}/members/${enc(userId)}`, { token }),

  /** Mensagens em ordem cronológica. `before` = id da mensagem mais antiga que você já tem. */
  getMessages: (token: string, id: string, before?: string, limit = PAGE_SIZE) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (before) query.set('before', before)
    return request<MessageDto[]>('GET', `/groups/${enc(id)}/messages?${query}`, { token })
  },

  sendMessage: (token: string, id: string, text: string, images: File[]) => {
    const body = new FormData()
    body.append('text', text)
    for (const image of images) body.append('images', image)
    return request<MessageDto>('POST', `/groups/${enc(id)}/messages`, { token, body })
  },

  deleteMessage: (token: string, id: string, messageId: string) =>
    request<void>('DELETE', `/groups/${enc(id)}/messages/${enc(messageId)}`, { token }),
}

// --- Estado dos grupos ---

export type GroupsAction =
  | { type: 'loaded'; groups: GroupDto[] }
  | { type: 'added'; group: GroupDto }
  | { type: 'updated'; group: GroupDto }
  | { type: 'removed'; groupId: string }
  | { type: 'presenceChanged'; userId: string; presence: Presence }

const upsertGroup = (list: GroupDto[], group: GroupDto) =>
  list.some((g) => g.id === group.id) ? list.map((g) => (g.id === group.id ? group : g)) : [group, ...list]

export function groupsReducer(state: GroupDto[], action: GroupsAction): GroupDto[] {
  switch (action.type) {
    case 'loaded':
      return action.groups
    case 'added':
    case 'updated':
      return upsertGroup(state, action.group)
    case 'removed':
      return state.filter((g) => g.id !== action.groupId)
    case 'presenceChanged':
      return state.map((g) =>
        g.members.some((m) => m.user.id === action.userId)
          ? { ...g, members: g.members.map((m) => (m.user.id === action.userId ? { ...m, presence: action.presence } : m)) }
          : g,
      )
  }
}

// --- Estado das mensagens (por grupo) ---

export interface ChatState {
  /** Do mais antigo para o mais novo. */
  items: MessageDto[]
  hasMore: boolean
}

export type MessagesState = Record<string, ChatState>

export type MessagesAction =
  | { type: 'loaded'; groupId: string; messages: MessageDto[] }
  | { type: 'olderLoaded'; groupId: string; messages: MessageDto[] }
  | { type: 'created'; message: MessageDto }
  | { type: 'deleted'; groupId: string; messageId: string }
  | { type: 'cleared'; groupId: string }

/** Junta sem duplicar pelo id (o novo vence) e ordena por data (estável: empate mantém a ordem). */
function mergeMessages(current: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

export function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case 'loaded': {
      const previous = state[action.groupId]
      const fullPage = action.messages.length === PAGE_SIZE
      if (!previous) return { ...state, [action.groupId]: { items: mergeMessages([], action.messages), hasMore: fullPage } }
      // Recarga (reconexão): se a página cheia não encosta no que já temos, houve buraco; fica só com ela.
      const overlaps = action.messages.some((m) => previous.items.some((p) => p.id === m.id))
      if (fullPage && !overlaps && previous.items.length > 0)
        return { ...state, [action.groupId]: { items: mergeMessages([], action.messages), hasMore: true } }
      return { ...state, [action.groupId]: { items: mergeMessages(previous.items, action.messages), hasMore: previous.hasMore } }
    }
    case 'olderLoaded': {
      const previous = state[action.groupId]
      if (!previous) return state
      return {
        ...state,
        [action.groupId]: { items: mergeMessages(previous.items, action.messages), hasMore: action.messages.length === PAGE_SIZE },
      }
    }
    case 'created': {
      const previous = state[action.message.groupId]
      if (!previous) return state // grupo ainda não aberto: a página carregada depois já traz a mensagem
      return { ...state, [action.message.groupId]: { ...previous, items: mergeMessages(previous.items, [action.message]) } }
    }
    case 'deleted': {
      const previous = state[action.groupId]
      if (!previous) return state
      return {
        ...state,
        [action.groupId]: {
          ...previous,
          items: previous.items.map((m) => (m.id === action.messageId ? { ...m, deleted: true, text: '', images: [] } : m)),
        },
      }
    }
    case 'cleared': {
      const rest = { ...state }
      delete rest[action.groupId]
      return rest
    }
  }
}

// --- Helpers de tela ---

const pad = (n: number) => String(n).padStart(2, '0')

/** Hora local em 24 h: "09:05". */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "HOJE", "ONTEM" ou "dd/mm/aaaa" (dia local). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (dayKey(d) === dayKey(now)) return 'HOJE'
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(d) === dayKey(yesterday)) return 'ONTEM'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export interface DayGroup {
  key: string
  label: string
  messages: MessageDto[]
}

/** Agrupa mensagens (já em ordem) por dia local, para pôr o separador de dia. */
export function groupByDay(messages: MessageDto[], now: Date = new Date()): DayGroup[] {
  const days: DayGroup[] = []
  for (const message of messages) {
    const key = dayKey(new Date(message.createdAt))
    const last = days[days.length - 1]
    if (last && last.key === key) last.messages.push(message)
    else days.push({ key, label: dayLabel(message.createdAt, now), messages: [message] })
  }
  return days
}

/** Confere a lista inteira de anexos. Devolve a mensagem de erro, ou null se estiver tudo certo. */
export function validateAttachments(files: ReadonlyArray<{ type: string; size: number }>): string | null {
  if (files.length > MAX_ATTACHMENTS) return `Dá para anexar no máximo ${MAX_ATTACHMENTS} imagens por mensagem.`
  if (files.some((f) => !f.type.startsWith('image/'))) return 'Só dá para anexar imagens.'
  if (files.some((f) => f.size > MAX_ATTACHMENT_BYTES)) return 'Cada imagem pode ter no máximo 10 MB.'
  return null
}
