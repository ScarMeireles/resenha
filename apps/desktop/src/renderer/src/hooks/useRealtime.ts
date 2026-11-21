import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { emptyFriends, friendsApi, friendsReducer } from '../lib/friends'
import { groupsApi, groupsReducer, messagesReducer, reloadVoice, voiceReducer, type GroupDto, type MessagesState, type VoiceState } from '../lib/groups'
import { createRealtime, type RealtimeHandlers } from '../lib/realtime'
import { missedCallsApi, type MissedCallDto } from '../lib/missedCalls'
import type { User } from '../lib/api'

/** Eventos de chamada, tratados por useCall. */
export type CallEvents = Pick<RealtimeHandlers, 'callIncoming' | 'callAccepted' | 'callDeclined' | 'callCancelled' | 'callEnded'>

const RETRY_MS = 5000

/**
 * Dados do app todo (amigos, grupos e mensagens) numa conexão SignalR só.
 * Carrega pela API e se mantém atualizado pelos eventos. Liga quando há token e desliga ao sair (desmonta).
 */
export function useRealtime(token: string, callEvents: CallEvents, onUserUpdated?: (user: User) => void) {
  const [voice, dispatchVoice] = useReducer(voiceReducer, {} as VoiceState)
  // Sempre o handler mais recente, sem religar a conexão a cada render.
  const callEventsRef = useRef(callEvents)
  callEventsRef.current = callEvents
  const onUserUpdatedRef = useRef(onUserUpdated)
  onUserUpdatedRef.current = onUserUpdated
  const [friends, dispatchFriends] = useReducer(friendsReducer, emptyFriends)
  const [groups, dispatchGroups] = useReducer(groupsReducer, [] as GroupDto[])
  const [messages, dispatchMessages] = useReducer(messagesReducer, {} as MessagesState)
  const [groupsLoaded, markGroupsLoaded] = useReducer(() => true, false)
  // Ligações que não tocaram porque o app estava fechado (vêm da API ao conectar e a cada reconexão).
  const [missedCalls, setMissedCalls] = useState<MissedCallDto[]>([])

  // O resync precisa saber quais conversas já foram abertas, sem religar a conexão a cada mensagem.
  const openChats = useRef<string[]>([])
  openChats.current = Object.keys(messages)
  // Grupos cuja sala de voz já foi carregada (a chave some do estado quando a sala esvazia, então guardamos à parte).
  const voiceGroups = useRef(new Set<string>())

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const quiet = () => undefined // sem rede: o próximo resync (reconexão) tenta de novo

    const resync = () => {
      void friendsApi.getFriends(token).then((data) => !stopped && dispatchFriends({ type: 'loaded', data }), quiet)
      void groupsApi.getGroups(token).then((list) => {
        if (stopped) return
        dispatchGroups({ type: 'loaded', groups: list })
        markGroupsLoaded()
      }, quiet)
      for (const groupId of openChats.current) {
        void groupsApi.getMessages(token, groupId).then(
          (page) => !stopped && dispatchMessages({ type: 'loaded', groupId, messages: page }),
          quiet,
        )
      }
      void reloadVoice(token, voiceGroups.current, (groupId, userIds) => !stopped && dispatchVoice({ groupId, userIds }))
      void missedCallsApi.list(token).then((list) => !stopped && setMissedCalls(list), quiet)
    }

    const realtime = createRealtime(token, {
      friendRequestReceived: (request) => dispatchFriends({ type: 'requestReceived', request }),
      friendAdded: (friend) => dispatchFriends({ type: 'friendAdded', friend }),
      friendRequestRemoved: ({ requestId }) => dispatchFriends({ type: 'requestRemoved', id: requestId }),
      friendRemoved: ({ userId }) => dispatchFriends({ type: 'friendRemoved', userId }),
      presenceChanged: ({ userId, presence }) => {
        dispatchFriends({ type: 'presenceChanged', userId, presence })
        dispatchGroups({ type: 'presenceChanged', userId, presence })
      },
      groupAdded: (group) => dispatchGroups({ type: 'added', group }),
      groupUpdated: (group) => dispatchGroups({ type: 'updated', group }),
      groupRemoved: ({ groupId }) => {
        dispatchGroups({ type: 'removed', groupId })
        dispatchMessages({ type: 'cleared', groupId })
      },
      messageCreated: (message) => dispatchMessages({ type: 'created', message }),
      messageDeleted: ({ groupId, messageId }) => dispatchMessages({ type: 'deleted', groupId, messageId }),
      voiceParticipants: ({ groupId, userIds }) => dispatchVoice({ groupId, userIds }),
      // Alguém mudou nome, foto, banner ou @: troca em amigos, pedidos, membros e mensagens já carregadas.
      userUpdated: (user) => {
        dispatchFriends({ type: 'userUpdated', user })
        dispatchGroups({ type: 'userUpdated', user })
        dispatchMessages({ type: 'userUpdated', user })
        onUserUpdatedRef.current?.(user)
      },
      callIncoming: (payload) => callEventsRef.current.callIncoming(payload),
      callAccepted: (payload) => callEventsRef.current.callAccepted(payload),
      callDeclined: (payload) => callEventsRef.current.callDeclined(payload),
      callCancelled: (payload) => callEventsRef.current.callCancelled(payload),
      callEnded: (payload) => callEventsRef.current.callEnded(payload),
      resync,
    })

    // A conexão inicial não tenta de novo sozinha; repetimos até conseguir ou sair.
    const connect = () =>
      realtime.start().catch(() => {
        if (!stopped) retry = setTimeout(connect, RETRY_MS)
      })

    resync()
    void connect()

    return () => {
      stopped = true
      clearTimeout(retry)
      void realtime.stop()
    }
  }, [token])

  // --- Amigos ---

  const sendRequest = useCallback(
    async (username: string) => {
      const request = await friendsApi.sendFriendRequest(token, username)
      dispatchFriends({ type: 'requestSent', request })
      return request
    },
    [token],
  )

  const accept = useCallback(
    async (id: string) => {
      const friend = await friendsApi.acceptFriendRequest(token, id)
      dispatchFriends({ type: 'friendAdded', friend })
    },
    [token],
  )

  /** Recusa um pedido recebido ou cancela um enviado. */
  const removeRequest = useCallback(
    async (id: string) => {
      await friendsApi.removeFriendRequest(token, id)
      dispatchFriends({ type: 'requestRemoved', id })
    },
    [token],
  )

  // --- Grupos ---

  const createGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      const group = await groupsApi.createGroup(token, name, memberIds)
      dispatchGroups({ type: 'added', group })
      return group
    },
    [token],
  )

  const renameGroup = useCallback(
    async (id: string, name: string) => dispatchGroups({ type: 'updated', group: await groupsApi.renameGroup(token, id, name) }),
    [token],
  )

  const addMembers = useCallback(
    async (id: string, userIds: string[]) => dispatchGroups({ type: 'updated', group: await groupsApi.addMembers(token, id, userIds) }),
    [token],
  )

  /** Sai do grupo (o próprio id) ou, sendo o dono, remove outra pessoa. */
  const removeMember = useCallback(
    async (groupId: string, userId: string, self: boolean) => {
      await groupsApi.removeMember(token, groupId, userId)
      if (self) {
        dispatchGroups({ type: 'removed', groupId })
        dispatchMessages({ type: 'cleared', groupId })
      } else {
        dispatchGroups({ type: 'updated', group: await groupsApi.getGroup(token, groupId) })
      }
    },
    [token],
  )

  // --- Mensagens ---

  const loadMessages = useCallback(
    async (groupId: string) => {
      const page = await groupsApi.getMessages(token, groupId)
      dispatchMessages({ type: 'loaded', groupId, messages: page })
    },
    [token],
  )

  const loadOlder = useCallback(
    async (groupId: string, before: string) => {
      const page = await groupsApi.getMessages(token, groupId, before)
      dispatchMessages({ type: 'olderLoaded', groupId, messages: page })
    },
    [token],
  )

  const sendMessage = useCallback(
    async (groupId: string, text: string, images: File[]) => {
      const message = await groupsApi.sendMessage(token, groupId, text, images)
      dispatchMessages({ type: 'created', message })
    },
    [token],
  )

  const deleteMessage = useCallback(
    async (groupId: string, messageId: string) => {
      await groupsApi.deleteMessage(token, groupId, messageId)
      dispatchMessages({ type: 'deleted', groupId, messageId })
    },
    [token],
  )

  /** Carrega quem está na sala de voz do grupo (ao abrir o grupo); depois os eventos mantêm atualizado. */
  const loadVoice = useCallback(
    async (groupId: string) => {
      voiceGroups.current.add(groupId)
      const { userIds } = await groupsApi.getVoice(token, groupId)
      dispatchVoice({ groupId, userIds })
    },
    [token],
  )

  /** Fechou o aviso: some da tela na hora e a API apaga. */
  const dismissMissedCalls = useCallback(() => {
    setMissedCalls([])
    void missedCallsApi.clear(token).catch(() => undefined)
  }, [token])

  return {
    friends, groups, groupsLoaded, messages, voice, loadVoice,
    sendRequest, accept, removeRequest,
    createGroup, renameGroup, addMembers, removeMember,
    loadMessages, loadOlder, sendMessage, deleteMessage,
    missedCalls, dismissMissedCalls,
  }
}

export type RealtimeData = ReturnType<typeof useRealtime>
