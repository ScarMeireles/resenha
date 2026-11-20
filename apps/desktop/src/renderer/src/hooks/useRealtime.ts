import { useCallback, useEffect, useReducer, useRef } from 'react'
import { emptyFriends, friendsApi, friendsReducer } from '../lib/friends'
import { groupsApi, groupsReducer, messagesReducer, type GroupDto, type MessagesState } from '../lib/groups'
import { createRealtime } from '../lib/realtime'

const RETRY_MS = 5000

/**
 * Dados do app todo (amigos, grupos e mensagens) numa conexão SignalR só.
 * Carrega pela API e se mantém atualizado pelos eventos. Liga quando há token e desliga ao sair (desmonta).
 */
export function useRealtime(token: string) {
  const [friends, dispatchFriends] = useReducer(friendsReducer, emptyFriends)
  const [groups, dispatchGroups] = useReducer(groupsReducer, [] as GroupDto[])
  const [messages, dispatchMessages] = useReducer(messagesReducer, {} as MessagesState)
  const [groupsLoaded, markGroupsLoaded] = useReducer(() => true, false)

  // O resync precisa saber quais conversas já foram abertas, sem religar a conexão a cada mensagem.
  const openChats = useRef<string[]>([])
  openChats.current = Object.keys(messages)

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

  return {
    friends, groups, groupsLoaded, messages,
    sendRequest, accept, removeRequest,
    createGroup, renameGroup, addMembers, removeMember,
    loadMessages, loadOlder, sendMessage, deleteMessage,
  }
}

export type RealtimeData = ReturnType<typeof useRealtime>
