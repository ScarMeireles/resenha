import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { HeadphonesIcon, LogOutIcon, MicIcon, PlusIcon, SettingsIcon, UserPlusIcon, UsersIcon } from '../components/Icons'
import { mediaUrl, type User } from '../lib/api'
import './Shell.css'

interface Props {
  user: User
  notice?: string
  onSignOut(): void
}

/**
 * Layout dos mockups: trilho de grupos | barra lateral | conteúdo.
 * Amigos, grupos e chamadas ainda não existem na API, então as áreas mostram o estado vazio.
 */
export function Shell({ user, notice, onSignOut }: Props) {
  const [banner, setBanner] = useState(notice)

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
          <button className="pill-button" disabled title="Em breve">
            <UserPlusIcon size={16} /> Adicionar amigo
          </button>
        </header>

        {banner && (
          <div className="content-banner" role="alert">
            <span>{banner}</span>
            <button className="btn-link" onClick={() => setBanner(undefined)}>Fechar</button>
          </div>
        )}

        <section className="content-empty">
          <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} size={88} ringColor="var(--bg-main)" />
          <h3>Boas-vindas ao Resenha, {user.displayName}</h3>
          <p>Ainda não tem ninguém por aqui. Em breve você vai adicionar amigos pelo @ e criar grupos com chat e sala de voz.</p>
        </section>
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
