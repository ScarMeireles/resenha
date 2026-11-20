import { useEffect, useRef, useState } from 'react'
import { mediaUrl, type User } from '../lib/api'
import { Avatar } from './Avatar'
import { HeadphonesIcon, LogOutIcon, MicIcon, SettingsIcon } from './Icons'

/** Rodapé da barra lateral: quem sou eu, controles de voz (em breve) e o menu da conta. */
export function UserPanel({ user, onSignOut }: { user: User; onSignOut(): void }) {
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
