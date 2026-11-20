import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { User } from '../lib/api'
import {
  callReducer, callsApi, initialCallState, isCurrentRoom, NOTICE_MS, startRingTimeout, type CallState,
} from '../lib/calls'
import { groupsApi, type VoiceCredentialsDto } from '../lib/groups'
import { connectVoice, type MicPrefs, type ParticipantView, type VoiceConnection } from '../lib/voice'
import type { CallEvents } from './useRealtime'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Chamada de voz do app, uma por vez (grupo ou 1:1). Entrar numa sala sai da anterior.
 * A lógica de estados está em lib/calls.ts (callReducer); aqui ficam a conexão LiveKit, os timers e a API.
 */
export function useCall(token: string) {
  const [state, dispatch] = useReducer(callReducer, initialCallState)
  const [participants, setParticipants] = useState<ParticipantView[]>([])
  // Sem chamada, mic/som guardam a preferência para a próxima.
  const [prefs, setPrefsState] = useState<MicPrefs>({ muted: false, deafened: false })
  const [viewing, setViewing] = useState(false)
  const [cameraOn, setCameraOn] = useState(false) // não é preferência: começa desligada em toda chamada
  const [connectedAt, setConnectedAt] = useState<number | null>(null)

  const stateRef = useRef<CallState>(state)
  stateRef.current = state
  const prefsRef = useRef(prefs)
  const connRef = useRef<VoiceConnection | null>(null)
  const attemptRef = useRef(0) // invalida respostas de tentativas antigas
  const stopRingRef = useRef<(() => void) | null>(null)

  /** Desconecta do LiveKit e cancela timers; não avisa a API. */
  const teardown = useCallback(() => {
    attemptRef.current++
    stopRingRef.current?.()
    stopRingRef.current = null
    connRef.current?.disconnect()
    connRef.current = null
    setParticipants([])
    setCameraOn(false)
  }, [])

  /** Sai da chamada atual, avisando a API quando é 1:1 (cancela se ainda estava chamando). */
  const hangUp = useCallback(() => {
    const current = stateRef.current.current
    if (current?.target.kind === 'direct') {
      const friendId = current.target.friend.id
      const call = current.status === 'active' ? callsApi.hangup : callsApi.cancel
      void call(token, friendId).catch(() => undefined)
    }
    teardown()
  }, [token, teardown])

  const connect = useCallback(
    async (credentials: VoiceCredentialsDto, attempt: number) => {
      const conn = await connectVoice(credentials, prefsRef.current, {
        onChange: (list) => attempt === attemptRef.current && setParticipants(list),
        onDropped: () => {
          if (attempt !== attemptRef.current) return
          teardown()
          dispatch({ type: 'failed', message: 'A conexão de voz caiu.' })
        },
      })
      if (attempt !== attemptRef.current) {
        conn.disconnect()
        return
      }
      connRef.current = conn
    },
    [teardown],
  )

  const joinGroup = useCallback(
    async (groupId: string) => {
      const current = stateRef.current.current
      setViewing(true)
      if (current?.target.kind === 'group' && current.target.groupId === groupId) return
      hangUp()
      const attempt = attemptRef.current
      dispatch({ type: 'groupJoining', groupId })
      try {
        const credentials = await groupsApi.voiceToken(token, groupId)
        if (attempt !== attemptRef.current) return
        await connect(credentials, attempt)
        if (attempt === attemptRef.current) dispatch({ type: 'groupConnected' })
      } catch (e) {
        if (attempt !== attemptRef.current) return
        teardown()
        setViewing(false)
        dispatch({ type: 'failed', message: errorText(e) })
      }
    },
    [token, hangUp, connect, teardown],
  )

  const dial = useCallback(
    async (friend: User) => {
      const current = stateRef.current.current
      if (current?.target.kind === 'direct' && current.target.friend.id === friend.id) return
      hangUp()
      const attempt = attemptRef.current
      dispatch({ type: 'dialing', friend })
      try {
        const credentials = await callsApi.dial(token, friend.id)
        if (attempt !== attemptRef.current) {
          void callsApi.cancel(token, friend.id).catch(() => undefined) // desistiu enquanto o servidor respondia
          return
        }
        dispatch({ type: 'dialed', room: credentials.room })
        stopRingRef.current = startRingTimeout(() => {
          void callsApi.cancel(token, friend.id).catch(() => undefined)
          teardown()
          dispatch({ type: 'timeout' })
        })
        await connect(credentials, attempt)
      } catch (e) {
        if (attempt !== attemptRef.current) return
        teardown()
        dispatch({ type: 'failed', message: errorText(e) })
      }
    },
    [token, hangUp, connect, teardown],
  )

  const accept = useCallback(async () => {
    const incoming = stateRef.current.incoming
    if (!incoming) return
    hangUp()
    const attempt = attemptRef.current
    dispatch({ type: 'acceptStarted', room: incoming.room, from: incoming.from })
    try {
      const credentials = await callsApi.accept(token, incoming.from.id)
      if (attempt !== attemptRef.current) return
      await connect(credentials, attempt)
      if (attempt === attemptRef.current) dispatch({ type: 'answered' })
    } catch (e) {
      if (attempt !== attemptRef.current) return
      teardown()
      dispatch({ type: 'failed', message: errorText(e) })
    }
  }, [token, hangUp, connect, teardown])

  const decline = useCallback(() => {
    const incoming = stateRef.current.incoming
    if (!incoming) return
    dispatch({ type: 'incomingDismissed' })
    void callsApi.decline(token, incoming.from.id).catch(() => undefined)
  }, [token])

  const leave = useCallback(() => {
    hangUp()
    dispatch({ type: 'left' })
  }, [hangUp])

  const setPrefs = useCallback((next: MicPrefs) => {
    prefsRef.current = next
    setPrefsState(next)
    const conn = connRef.current
    if (!conn) return
    void conn.setDeafened(next.deafened).then(() => conn.setMuted(next.muted)).catch(() => undefined)
  }, [])

  // Ligar o mic enquanto ensurdecido também desensurdece, como no Discord.
  const setMuted = useCallback(
    (muted: boolean) => setPrefs({ muted, deafened: muted ? prefsRef.current.deafened : false }),
    [setPrefs],
  )
  const setDeafened = useCallback((deafened: boolean) => setPrefs({ ...prefsRef.current, deafened }), [setPrefs])

  const setCamera = useCallback((on: boolean) => {
    const conn = connRef.current
    if (!conn) return
    setCameraOn(on)
    conn.setCamera(on).catch(() => {
      setCameraOn(false)
      dispatch({ type: 'notice', message: 'Não foi possível ligar a câmera.' })
    })
  }, [])

  // Derivado dos participantes: reflete também quando o sistema encerra a captura por conta própria.
  const screenSharing = participants.some((p) => p.isLocal && p.screen != null)

  const startScreenShare = useCallback(async (sourceId: string, audio: boolean) => {
    const conn = connRef.current
    if (!conn) return
    try {
      await window.resenha.screen.choose({ sourceId, audio })
      await conn.setScreenShare(true, audio)
    } catch {
      dispatch({ type: 'notice', message: 'Não foi possível compartilhar a tela.' })
    }
  }, [])

  const stopScreenShare = useCallback(async () => {
    const conn = connRef.current
    if (!conn) return
    try {
      await conn.setScreenShare(false, false)
    } catch {
      dispatch({ type: 'notice', message: 'Não foi possível parar o compartilhamento.' })
    }
  }, [])

  const events: CallEvents = {
    callIncoming: ({ room, from }) => dispatch({ type: 'incoming', call: { room, from } }),
    callAccepted: ({ room }) => {
      if (isCurrentRoom(stateRef.current, room)) {
        stopRingRef.current?.()
        stopRingRef.current = null
      }
      dispatch({ type: 'accepted', room })
    },
    callDeclined: ({ room }) => {
      if (isCurrentRoom(stateRef.current, room)) teardown()
      dispatch({ type: 'declined', room })
    },
    callCancelled: ({ room }) => dispatch({ type: 'cancelled', room }),
    callEnded: ({ room }) => {
      if (isCurrentRoom(stateRef.current, room)) teardown()
      dispatch({ type: 'ended', room })
    },
  }

  const status = state.current?.status
  const kind = state.current?.target.kind

  // Ao atender/ser atendido numa 1:1, mostra a tela da chamada; sem chamada, ela some.
  useEffect(() => {
    if (!status) setViewing(false)
    else if (status === 'active' && kind === 'direct') setViewing(true)
  }, [status, kind])

  // Marca quando a chamada ficou ativa, para a duração.
  useEffect(() => {
    setConnectedAt(status === 'active' ? (prev) => prev ?? Date.now() : null)
  }, [status])

  // Avisos curtos somem sozinhos.
  useEffect(() => {
    if (!state.notice) return
    const id = setTimeout(() => dispatch({ type: 'noticeCleared' }), NOTICE_MS)
    return () => clearTimeout(id)
  }, [state.notice])

  // Ao sair do app (desmontar), encerra a chamada.
  const hangUpRef = useRef(hangUp)
  hangUpRef.current = hangUp
  useEffect(() => () => hangUpRef.current(), [])

  return { state, participants, prefs, viewing, setViewing, connectedAt, events, joinGroup, dial, accept, decline, leave, setMuted, setDeafened, cameraOn, setCamera, screenSharing, startScreenShare, stopScreenShare }
}

export type CallApi = ReturnType<typeof useCall>

/** A chamada mais o texto que a descreve (ex.: "Churrasco" ou "Ana"), montado pelo Shell. */
export type CallContextValue = CallApi & { label: string | null }

export const CallContext = createContext<CallContextValue | null>(null)

/** Acesso à chamada atual a partir de qualquer componente dentro do Shell. */
export function useCallContext(): CallContextValue {
  const call = useContext(CallContext)
  if (!call) throw new Error('useCallContext fora do CallContext.Provider')
  return call
}
