import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { HeadphonesIcon, LogOutIcon, MicIcon, PlusIcon, SettingsIcon, UserPlusIcon, UsersIcon } from '../components/Icons'
import { useFriends } from '../hooks/useFriends'
import { mediaUrl, type User } from '../lib/api'
import { FriendsView } from './FriendsView'
import './Shell.css'

interface Props {
  user: User
  token: string
  notice?: string
  onSignOut(): void
}

/**
 * Layout dos mockups: trilho de grupos | barra lateral | conteúdo.
 * Amigos (pedidos e presença em tempo real) já vêm da API; grupos e chamadas ainda não existem e mostram o estado vazio.
 */
export function Shell({ user, token, notice, onSignOut }: Props) {
  const [banner, setBanner] = useState(notice)
  const { state: friends, sendRequest, accept, removeRequest } = useFriends(token)
  const addFriendInput = useRef<HTMLInputElement>(null)
  const pending = friends.incoming.length

  return (
    <div className="shell">
      <nav className="rail" aria-label="Grupos">
        <div className="rail-item">
          <span className="rail-pill" aria-hidden="true" />
          <button className="rail-home" aria-label="Início" aria-current="page">R</button>
        </div>
        <div className="rail-divider" aria-hidden="true" />
        <button className="rail-add" aria-label="Criar grupo (em breve)" title="Em breve" disabled>
          <PlusIcon size={22} />
        </button>
      </nav>

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
          <p className="sidebar-empty">Suas conversas e grupos aparecem aqui.</p>
        </div>
        <UserPanel user={user} onSignOut={onSignOut} />
      </aside>

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

        <FriendsView state={friends} inputRef={addFriendInput} onSendRequest={sendRequest} onAccept={accept}
          onRemoveRequest={removeRequest} />
      </main>
    </div>
  )
}

function UserPanel({ user, onSignOut }: { user: User; onSignOut(): void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div className="user-panel" ref={panelRef}>
      <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} presence="online" ringColor="var(--bg-panel)" />
      <div className="user-panel-names">
        <span className="user-panel-name">{user.displayName}</span>
        <span className="user-panel-handle">@{user.username}</span>
      </div>
      <button className="icon-button" aria-label="Microfone (em breve)" title="Em breve" disabled><MicIcon /></button>
      <button className="icon-button" aria-label="Som (em breve)" title="Em breve" disabled><HeadphonesIcon /></button>
      <button className="icon-button" aria-label="Configurações da conta" aria-haspopup="menu" aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}>
        <SettingsIcon />
      </button>

      {menuOpen && (
        <div className="user-menu" role="menu">
          <button role="menuitem" className="user-menu-item user-menu-item--danger" onClick={onSignOut} autoFocus>
            <LogOutIcon /> Sair da conta
          </button>
        </div>
      )}
    </div>
  )
}
