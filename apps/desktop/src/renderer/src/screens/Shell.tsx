import { useEffect, useRef, useState } from 'react'
import { PlusIcon, UserPlusIcon, UsersIcon } from '../components/Icons'
import { CallCards } from '../components/CallCards'
import { UserPanel } from '../components/UserPanel'
import { CallContext, useCall } from '../hooks/useCall'
import { useRealtime } from '../hooks/useRealtime'
import { MyStatusContext, useMyStatus } from '../hooks/useMyStatus'
import type { User } from '../lib/api'
import { showsCallScreen } from '../lib/calls'
import { totalUnread } from '../lib/dms'
import { initials } from '../lib/groups'
import { CallView } from './CallView'
import { GroupChatView } from './ChatView'
import { DirectChatView } from './DirectChatView'
import { DirectMessageList, NewMessageModal } from './DirectMessages'
import { FriendsView } from './FriendsView'
import { CreateGroupModal } from './GroupModals'
import { GroupSidebar } from './GroupSidebar'
import { MembersPanel } from './MembersPanel'
import { ScreenPicker } from '../components/ScreenPicker'
import './Shell.css'
import './Chat.css'

interface Props {
  user: User
  token: string
  notice?: string
  onSignOut(): void
}

/**
 * Layout dos mockups: trilho de grupos | barra lateral | conteúdo (| membros, dentro de um grupo).
 * Amigos, grupos e mensagens vêm da API e se atualizam em tempo real por uma conexão só.
 */
export function Shell({ user, token, notice, onSignOut }: Props) {
  const [banner, setBanner] = useState(notice)
  const call = useCall(token)
  const data = useRealtime(token, user.id, call.events)
  const myStatus = useMyStatus(token)
  const { friends, groups } = data
  const [openId, setOpenId] = useState<string | null>(null)
  // Conversa direta aberta no Início (null = tela de Amigos).
  const [dmId, setDmId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pickingScreen, setPickingScreen] = useState(false)
  const addFriendInput = useRef<HTMLInputElement>(null)
  const pending = friends.incoming.length
  const group = groups.find((g) => g.id === openId)
  const current = call.state.current
  const target = current?.target
  const callGroup = target?.kind === 'group' ? groups.find((g) => g.id === target.groupId) : undefined

  /** Troca de grupo (ou volta para Amigos); sai da tela da chamada sem desconectar. */
  const navigate = (id: string | null) => {
    setOpenId(id)
    setDmId(null)
    call.setViewing(false)
  }

  /** Abre uma conversa direta no Início. */
  const openDm = (id: string) => {
    setOpenId(null)
    setDmId(id)
    call.setViewing(false)
  }

  /** Abre (ou cria) a conversa com um amigo ("Mensagem" na lista ou o "+"). */
  const messageFriend = async (userId: string) => openDm(await data.openConversation(userId))

  // Quem está na sala de voz do grupo aberto (depois os eventos mantêm atualizado).
  const { loadVoice } = data
  useEffect(() => {
    if (openId) void loadVoice(openId).catch(() => undefined)
  }, [openId, loadVoice])

  /** Acha os dados de uma pessoa pelo id (eu, amigos ou membros de grupos). */
  const resolveUser = (id: string): User | undefined =>
    id === user.id ? user : friends.friends.find((f) => f.user.id === id)?.user ?? groups.flatMap((g) => g.members).find((m) => m.user.id === id)?.user

  const callLabel = current ? (current.target.kind === 'direct' ? current.target.friend.displayName : callGroup?.name ?? null) : null
  const showCall = showsCallScreen(call.viewing, current)

  // DM na tela agora: zera as não lidas dela e marca como lido o que chegar enquanto estiver aberta.
  const dm = group ? undefined : data.conversations.find((c) => c.id === dmId)
  const dmFriend = dm ? friends.friends.find((f) => f.user.id === dm.user.id) : undefined
  const viewedDm = dm && !showCall ? dm.id : null
  const viewedLastAt = dm?.lastMessage?.createdAt ?? null
  const { viewDm } = data
  useEffect(() => {
    viewDm(viewedDm, viewedLastAt)
    return () => viewDm(null, null)
  }, [viewedDm, viewedLastAt, viewDm])
  const unreadDms = totalUnread(data.unread)
  // Se a chamada acabar com o seletor aberto, fecha o seletor.
  useEffect(() => {
    if (!current) setPickingScreen(false)
  }, [current])
  const callScreen = showCall && current ? (
    <CallView crumbs={current.target.kind === 'direct' ? [current.target.friend.displayName] : [callLabel ?? 'Grupo', 'Sala de voz']}
      connecting={current.status === 'connecting'} participants={call.participants} resolve={resolveUser} connectedAt={call.connectedAt}
      prefs={call.prefs} onToggleMic={() => call.setMuted(!(call.prefs.muted || call.prefs.deafened))}
      cameraOn={call.cameraOn} onToggleCamera={() => call.setCamera(!call.cameraOn)}
      screenSharing={call.screenSharing} onShareScreen={() => setPickingScreen(true)} onStopScreen={() => void call.stopScreenShare()}
      onToggleDeafen={() => call.setDeafened(!call.prefs.deafened)} onLeave={call.leave} />
  ) : null

  // Se o grupo aberto sumir (saí, fui removido), volta para Amigos.
  useEffect(() => {
    if (openId && data.groupsLoaded && !group) setOpenId(null)
  }, [openId, data.groupsLoaded, group])

  return (
    <CallContext.Provider value={{ ...call, label: callLabel }}>
    <MyStatusContext.Provider value={myStatus}>
    <div className={`shell${group ? ' shell--group' : ''}`}>
      <nav className="rail" aria-label="Grupos">
        <div className="rail-item">
          {!group && <span className="rail-pill" aria-hidden="true" />}
          <button className="rail-button rail-home" aria-label="Início" title="Início" aria-current={group ? undefined : 'page'}
            onClick={() => navigate(null)}>
            R
          </button>
          {group && unreadDms > 0 && (
            <span className="rail-badge" aria-label={`${unreadDms} mensagens diretas não lidas`}>{unreadDms > 99 ? '99+' : unreadDms}</span>
          )}
        </div>
        <div className="rail-divider" aria-hidden="true" />
        {groups.map((g) => (
          <div className="rail-item" key={g.id}>
            {g.id === group?.id && <span className="rail-pill" aria-hidden="true" />}
            <button className="rail-button rail-group" aria-label={g.name} title={g.name} aria-current={g.id === group?.id ? 'page' : undefined}
              onClick={() => navigate(g.id)}>
              {initials(g.name)}
            </button>
          </div>
        ))}
        <button className="rail-add" aria-label="Criar grupo" title="Criar grupo" onClick={() => setCreating(true)}>
          <PlusIcon size={22} />
        </button>
      </nav>

      {group ? (
        <>
          <GroupSidebar group={group} user={user} friends={friends.friends} onSignOut={onSignOut}
            voiceUserIds={data.voice[group.id] ?? []}
            liveParticipants={callGroup?.id === group.id ? call.participants : []}
            channel={showCall ? (callGroup?.id === group.id ? 'voice' : null) : 'chat'}
            onOpenChat={() => call.setViewing(false)}
            onJoinVoice={() => void call.joinGroup(group.id)}
            onRename={(name) => data.renameGroup(group.id, name)}
            onAddMembers={(ids) => data.addMembers(group.id, ids)}
            onLeave={() => data.removeMember(group.id, user.id, true)} />
          {callScreen ?? (
            <GroupChatView key={group.id} group={group} user={user} chat={data.messages[group.id]}
              inCall={callGroup?.id === group.id} onJoinCall={() => void call.joinGroup(group.id)}
              onLoad={() => data.loadMessages(group.id)}
              onLoadOlder={(before) => data.loadOlder(group.id, before)}
              onSend={(text, images) => data.sendMessage(group.id, text, images)}
              onDelete={(messageId) => data.deleteMessage(group.id, messageId)} />
          )}
          <MembersPanel group={group} meId={user.id} voiceUserIds={data.voice[group.id] ?? []} onRemove={(userId) => data.removeMember(group.id, userId, false)} />
        </>
      ) : (
        <>
          <aside className="sidebar">
            <header className="pane-header">
              <h1 className="sidebar-title">Início</h1>
            </header>
            <div className="sidebar-body">
              <button className="sidebar-link" aria-current={dm ? undefined : 'page'} onClick={() => navigate(null)}>
                <UsersIcon /> Amigos
                {pending > 0 && <span className="sidebar-badge" aria-label={`${pending} pedidos recebidos`}>{pending}</span>}
              </button>
              <DirectMessageList meId={user.id} conversations={data.conversations} friends={friends.friends} unread={data.unread}
                openId={dm?.id ?? null} onOpen={openDm} onNew={() => setNewMessage(true)} />
            </div>
            <UserPanel user={user} onSignOut={onSignOut} />
          </aside>

          {callScreen ?? (dm ? (
            <DirectChatView key={dm.id} conversation={dm} other={dmFriend?.user ?? dm.user} presence={dmFriend?.presence} user={user}
              chat={data.dmMessages[dm.id]}
              inCall={target?.kind === 'direct' && target.friend.id === dm.user.id}
              onCall={() => (target?.kind === 'direct' && target.friend.id === dm.user.id ? call.setViewing(true) : void call.dial(dmFriend?.user ?? dm.user))}
              onLoad={() => data.loadDmMessages(dm.id)}
              onLoadOlder={(before) => data.loadOlderDm(dm.id, before)}
              onSend={(text, images) => data.sendDm(dm.id, text, images)}
              onDelete={(messageId) => data.deleteDm(dm.id, messageId)} />
          ) : (
          <main className="content">
            <header className="pane-header content-header">
              <UsersIcon size={20} />
              <h2>Amigos</h2>
              <button className="pill-button" onClick={() => addFriendInput.current?.focus()}>
                <UserPlusIcon size={16} /> Adicionar amigo
              </button>
            </header>

            {banner && (
              <div className="content-banner" role="alert">
                <span>{banner}</span>
                <button className="btn-link" onClick={() => setBanner(undefined)}>Fechar</button>
              </div>
            )}

            <FriendsView state={friends} inputRef={addFriendInput} onSendRequest={data.sendRequest} onAccept={data.accept}
              onRemoveRequest={data.removeRequest} onCall={(friend) => void call.dial(friend)}
              onMessage={(friend) => messageFriend(friend.id)} />
          </main>
          ))}
        </>
      )}

      {pickingScreen && (
        <ScreenPicker onCancel={() => setPickingScreen(false)}
          onConfirm={(id, audio) => { setPickingScreen(false); void call.startScreenShare(id, audio) }} />
      )}
      {newMessage && (
        <NewMessageModal friends={friends.friends} onPick={messageFriend} onClose={() => setNewMessage(false)} />
      )}
      {creating && (
        <CreateGroupModal friends={friends.friends} onClose={() => setCreating(false)}
          onCreate={async (name, memberIds) => {
            const created = await data.createGroup(name, memberIds)
            navigate(created.id)
          }} />
      )}

      <CallCards state={call.state} onAccept={() => void call.accept()} onDecline={call.decline} onCancel={call.leave}
        missedCalls={data.missedCalls} onDismissMissed={data.dismissMissedCalls}
        onCallBack={(friend) => { data.dismissMissedCalls(); void call.dial(friend) }} />
    </div>
    </MyStatusContext.Provider>
    </CallContext.Provider>
  )
}
