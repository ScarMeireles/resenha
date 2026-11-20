import { useEffect, useRef, useState } from 'react'
import { ConfirmModal } from '../components/Modal'
import { ChevronDownIcon, EditIcon, HashIcon, HeadphonesIcon, LogOutIcon, UserPlusIcon } from '../components/Icons'
import { UserPanel } from '../components/UserPanel'
import type { User } from '../lib/api'
import type { FriendDto } from '../lib/friends'
import { MAX_GROUP_MEMBERS, type GroupDto } from '../lib/groups'
import { AddPeopleModal, RenameGroupModal } from './GroupModals'

type Dialog = 'rename' | 'leave' | 'add' | null

interface Props {
  group: GroupDto
  user: User
  friends: FriendDto[]
  onRename(name: string): Promise<void>
  onAddMembers(userIds: string[]): Promise<void>
  onLeave(): Promise<void>
  onSignOut(): void
}

/** Barra lateral de um grupo: nome com menu de configurações, canais e botão de adicionar pessoas. */
export function GroupSidebar({ group, user, friends, onRename, onAddMembers, onLeave, onSignOut }: Props) {
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
        <button className="channel channel--active" aria-current="page"><HashIcon size={18} /> conversa</button>
        <button className="channel" disabled title="Em breve"><HeadphonesIcon size={18} /> Sala de voz</button>
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
