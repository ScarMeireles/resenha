import { useEffect, useRef, useState } from 'react'
import { ConfirmModal } from '../components/Modal'
import { Avatar } from '../components/Avatar'
import { ChevronDownIcon, EditIcon, HashIcon, LogOutIcon, MicOffIcon, SpeakerIcon, UserPlusIcon } from '../components/Icons'
import { UserPanel } from '../components/UserPanel'
import { mediaUrl, type User } from '../lib/api'
import type { FriendDto } from '../lib/friends'
import { MAX_GROUP_MEMBERS, type GroupDto } from '../lib/groups'
import type { ParticipantView } from '../lib/voice'
import { AddPeopleModal, RenameGroupModal } from './GroupModals'

type Dialog = 'rename' | 'leave' | 'add' | null

interface Props {
  group: GroupDto
  user: User
  friends: FriendDto[]
  /** Quem está na sala de voz (ids), vindo do servidor. */
  voiceUserIds: string[]
  /** Dados ao vivo (falando/mutado) — só existem se eu estou nesta sala. */
  liveParticipants: ParticipantView[]
  /** Canal em exibição no conteúdo: o chat, a sala de voz deste grupo ou nenhum (ex.: tela de uma chamada 1:1). */
  channel: 'chat' | 'voice' | null
  /** Mostra o chat do grupo; se houver chamada, ela continua rodando por trás. */
  onOpenChat(): void
  /** Entra na sala de voz ou, se já estou nela, volta para a tela da chamada. */
  onJoinVoice(): void
  onRename(name: string): Promise<void>
  onAddMembers(userIds: string[]): Promise<void>
  onLeave(): Promise<void>
  onSignOut(): void
}

/** Barra lateral de um grupo: nome com menu de configurações, canais e botão de adicionar pessoas. */
export function GroupSidebar({ group, user, friends, voiceUserIds, liveParticipants, channel, onOpenChat, onJoinVoice, onRename, onAddMembers, onLeave, onSignOut }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const headerRef = useRef<HTMLElement>(null)
  const isOwner = group.ownerId === user.id
  const full = group.members.length >= MAX_GROUP_MEMBERS

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const open = (next: Dialog) => {
    setMenuOpen(false)
    setDialog(next)
  }

  return (
    <aside className="sidebar">
      <header className="pane-header group-header" ref={headerRef}>
        <h1 className="sidebar-title group-title">{group.name}</h1>
        <button className="icon-button" aria-label="Configurações do grupo" aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}>
          <ChevronDownIcon />
        </button>
        {menuOpen && (
          <div className="user-menu group-menu" role="menu">
            {isOwner && (
              <button role="menuitem" className="user-menu-item" onClick={() => open('rename')}>
                <EditIcon /> Renomear grupo
              </button>
            )}
            <button role="menuitem" className="user-menu-item user-menu-item--danger" onClick={() => open('leave')}>
              <LogOutIcon /> Sair do grupo
            </button>
          </div>
        )}
      </header>

      <div className="sidebar-body">
        <button className={`channel${channel === 'chat' ? ' channel--active' : ''}`} aria-current={channel === 'chat' ? 'page' : undefined}
          onClick={onOpenChat}>
          <HashIcon size={18} /> conversa
        </button>
        <button className={`channel${channel === 'voice' ? ' channel--active' : ''}`} aria-current={channel === 'voice' ? 'page' : undefined}
          onClick={onJoinVoice}>
          <SpeakerIcon size={18} /> Sala de voz
          {voiceUserIds.length > 0 && <span className="voice-count">{voiceUserIds.length} na sala</span>}
        </button>
        {voiceUserIds.length > 0 && (
          <ul className="voice-list" aria-label="Na sala de voz">
            {voiceUserIds.map((id) => {
              const member = group.members.find((m) => m.user.id === id)?.user
              const live = liveParticipants.find((p) => p.id === id)
              return (
                <li key={id} className="voice-user">
                  <Avatar name={member?.displayName ?? '?'} seed={id} src={mediaUrl(member?.avatarUrl ?? null)} size={24} speaking={live?.isSpeaking} />
                  <span className="voice-user-name">{member?.displayName ?? 'Alguém'}</span>
                  {live?.isMuted && <span className="voice-user-muted" role="img" aria-label="Microfone desligado"><MicOffIcon size={14} /></span>}
                </li>
              )
            })}
          </ul>
        )}
        <button className="channel channel--action" disabled={full} title={full ? `O grupo já tem ${MAX_GROUP_MEMBERS} pessoas` : undefined}
          onClick={() => open('add')}>
          <UserPlusIcon size={18} /> Adicionar pessoas
        </button>
      </div>

      <UserPanel user={user} onSignOut={onSignOut} />

      {dialog === 'rename' && <RenameGroupModal group={group} onRename={onRename} onClose={() => setDialog(null)} />}
      {dialog === 'add' && <AddPeopleModal group={group} friends={friends} onAdd={onAddMembers} onClose={() => setDialog(null)} />}
      {dialog === 'leave' && (
        <ConfirmModal title={`Sair de ${group.name}?`} confirmLabel="Sair" onConfirm={onLeave} onClose={() => setDialog(null)} />
      )}
    </aside>
  )
}
