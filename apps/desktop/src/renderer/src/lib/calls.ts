import { request, type User } from './api'
import type { VoiceCredentialsDto } from './groups'

/** Chamadas 1:1 (ligar, atender, recusar...) e o estado global de chamada, uma por vez. */

export const RING_TIMEOUT_MS = 30_000
export const NOTICE_MS = 3_000

const enc = encodeURIComponent

export const callsApi = {
  /** Liga para um amigo (409 "{Nome} está offline" se ele não estiver conectado). */
  dial: (token: string, friendId: string) => request<VoiceCredentialsDto>('POST', `/calls/${enc(friendId)}`, { token }),
  accept: (token: string, friendId: string) => request<VoiceCredentialsDto>('POST', `/calls/${enc(friendId)}/accept`, { token }),
  decline: (token: string, friendId: string) => request<void>('POST', `/calls/${enc(friendId)}/decline`, { token }),
  cancel: (token: string, friendId: string) => request<void>('POST', `/calls/${enc(friendId)}/cancel`, { token }),
  hangup: (token: string, friendId: string) => request<void>('POST', `/calls/${enc(friendId)}/hangup`, { token }),
}

export type CallTarget = { kind: 'group'; groupId: string } | { kind: 'direct'; friend: User }
export type CallStatus = 'connecting' | 'ringing-out' | 'active'

export interface CurrentCall {
  target: CallTarget
  status: CallStatus
  /** Nome da sala; nas chamadas 1:1 só existe depois que o servidor responde. */
  room?: string
}

export interface IncomingCall {
  room: string
  from: User
}

export interface CallState {
  current: CurrentCall | null
  incoming: IncomingCall | null
  notice: string | null
}

export const initialCallState: CallState = { current: null, incoming: null, notice: null }

export type CallAction =
  | { type: 'groupJoining'; groupId: string }
  | { type: 'groupConnected' }
  | { type: 'dialing'; friend: User }
  | { type: 'dialed'; room: string }
  | { type: 'acceptStarted'; room: string; from: User }
  | { type: 'answered' }
  | { type: 'left' }
  | { type: 'failed'; message: string }
  | { type: 'timeout' }
  | { type: 'incoming'; call: IncomingCall }
  | { type: 'incomingDismissed' }
  | { type: 'accepted'; room: string }
  | { type: 'declined'; room: string }
  | { type: 'cancelled'; room: string }
  | { type: 'ended'; room: string }
  | { type: 'noticeCleared' }
  /** Aviso avulso: não mexe na chamada em andamento. */
  | { type: 'notice'; message: string }

const nameOf = (call: CurrentCall) => (call.target.kind === 'direct' ? call.target.friend.displayName : '')

/** A sala informada é a da chamada atual? */
export const isCurrentRoom = (state: CallState, room: string): boolean => state.current?.room === room

/** Máquina de estados da chamada como função pura. */
export function callReducer(state: CallState, action: CallAction): CallState {
  const { current } = state
  switch (action.type) {
    case 'groupJoining':
      return { ...state, current: { target: { kind: 'group', groupId: action.groupId }, status: 'connecting' }, notice: null }
    case 'groupConnected':
      return current?.target.kind === 'group' ? { ...state, current: { ...current, status: 'active' } } : state
    case 'dialing':
      return { ...state, current: { target: { kind: 'direct', friend: action.friend }, status: 'connecting' }, notice: null }
    case 'dialed':
      return current?.target.kind === 'direct' ? { ...state, current: { ...current, status: 'ringing-out', room: action.room } } : state
    case 'acceptStarted':
      return {
        ...state,
        current: { target: { kind: 'direct', friend: action.from }, status: 'connecting', room: action.room },
        incoming: null,
        notice: null,
      }
    case 'answered':
      return current?.target.kind === 'direct' ? { ...state, current: { ...current, status: 'active' } } : state
    case 'left':
      return { ...state, current: null }
    case 'failed':
      return { ...state, current: null, notice: action.message }
    case 'timeout':
      return current ? { ...state, current: null, notice: `${nameOf(current)} não atendeu` } : state
    case 'incoming':
      return { ...state, incoming: action.call }
    case 'incomingDismissed':
      return { ...state, incoming: null }
    case 'accepted':
      return current && isCurrentRoom(state, action.room) ? { ...state, current: { ...current, status: 'active' } } : state
    case 'declined':
      return current && isCurrentRoom(state, action.room) ? { ...state, current: null, notice: `${nameOf(current)} recusou` } : state
    case 'cancelled':
      return state.incoming?.room === action.room ? { ...state, incoming: null } : state
    case 'ended':
      return current && isCurrentRoom(state, action.room) ? { ...state, current: null, notice: 'Chamada encerrada' } : state
    case 'noticeCleared':
      return { ...state, notice: null }
    case 'notice':
      return { ...state, notice: action.message }
  }
}

/** Agenda o fim do toque; devolve a função que cancela. Separada do hook para testar com timers falsos. */
export function startRingTimeout(onTimeout: () => void, ms = RING_TIMEOUT_MS): () => void {
  const id = setTimeout(onTimeout, ms)
  return () => clearTimeout(id)
}
