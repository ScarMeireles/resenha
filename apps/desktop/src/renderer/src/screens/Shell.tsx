import { useEffect, useRef, useState } from 'react'
import { PlusIcon, UserPlusIcon, UsersIcon } from '../components/Icons'
import { CallCards } from '../components/CallCards'
import { UserPanel } from '../components/UserPanel'
import { CallContext, useCall } from '../hooks/useCall'
import { useRealtime } from '../hooks/useRealtime'
import { MyStatusContext, useMyStatus } from '../hooks/useMyStatus'
import { AccountContext } from '../hooks/useAccount'
import type { User } from '../lib/api'
import { showsCallScreen } from '../lib/calls'
import { initials } from '../lib/groups'
import { CallView } from './CallView'
import { ChatView } from './ChatView'
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
  onAccountChange(user: User, newToken?: string): Promise<void>
}

/**
 * Layout dos mockups: trilho de grupos | barra lateral | conteúdo (| membros, dentro de um grupo).
 * Amigos, grupos e mensagens vêm da API e se atualizam em tempo real por uma conexão só.
 */
export function Shell({ user, token, notice, onSignOut, onAccountChange }: Props) {
  const [banner, setBanner] = useState(notice)
  const call = useCall(token)
  // Meus dados mudaram em outra janela: atualiza aqui também.
  const data = useRealtime(token, call.events, (changed) => {
    if (changed.id === user.id) void onAccountChange(changed)
  })
  const myStatus = useMyStatus(token)
  const { friends, groups } = data
  const [openId, setOpenId] = useState<string | null>(null)
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
    call.setViewing(false)
  }

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
    <AccountContext.Provider value={{ token, update: onAccountChange }}>
    <div className={`shell${group ? ' shell--group' : ''}`}>
      <nav className="rail" aria-label="Grupos">
        <div className="rail-item">
          {!group && <span className="rail-pill" aria-hidden="true" />}
          <button className="rail-button rail-home" aria-label="Amigos" title="Amigos" aria-current={group ? undefined : 'page'}
            onClick={() => navigate(null)}>
            R
          </button>
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
            <ChatView key={group.id} group={group} user={user} chat={data.messages[group.id]}
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
              <button className="sidebar-link" aria-current="page">
                <UsersIcon /> Amigos
                {pending > 0 && <span className="sidebar-badge" aria-label={`${pending} pedidos recebidos`}>{pending}</span>}
              </button>
              <h2 className="sidebar-section">Conversas</h2>
              <p className="sidebar-empty">Seus grupos aparecem no trilho à esquerda.</p>
            </div>
            <UserPanel user={user} onSignOut={onSignOut} />
          </aside>

          {callScreen ?? (
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
              onRemoveRequest={data.removeRequest} onCall={(friend) => void call.dial(friend)} />
          </main>
          )}
        </>
      )}

      {pickingScreen && (
        <ScreenPicker onCancel={() => setPickingScreen(false)}
          onConfirm={(id, audio) => { setPickingScreen(false); void call.startScreenShare(id, audio) }} />
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
    </AccountContext.Provider>
    </MyStatusContext.Provider>
    </CallContext.Provider>
  )
}
