import { useEffect, useRef, useState } from 'react'
import { mediaUrl, type User } from '../lib/api'
import { presenceLabel } from '../lib/presence'
import { Avatar } from './Avatar'
import { MediaSettingsModal } from './MediaSettingsModal'
import { ProfileCard } from './ProfileCard'
import { useCallContext } from '../hooks/useCall'
import { useMyStatusContext } from '../hooks/useMyStatus'
import { HeadphonesIcon, HeadphonesOffIcon, LogOutIcon, MicIcon, MicOffIcon, PhoneIcon, SettingsIcon } from './Icons'

/** Rodapé da barra lateral: quem sou eu (clicar na foto abre o cartão de perfil), microfone/som e o menu da conta. */
export function UserPanel({ user, onSignOut }: { user: User; onSignOut(): void }) {
  const call = useCallContext()
  const myStatus = useMyStatusContext()
  const micOff = call.prefs.muted || call.prefs.deafened
  const [accountMenu, setAccountMenu] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fecha o menu da conta ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!accountMenu) return
    const onPointer = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setAccountMenu(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAccountMenu(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountMenu])

  return (
    <>
      {call.state.current && call.state.current.status !== 'ringing-out' && !call.viewing && (
        <button className="call-bar" onClick={() => call.setViewing(true)}>
          <PhoneIcon size={16} /> Em chamada{call.label ? ` · ${call.label}` : ''} <span className="call-bar-back">Voltar</span>
        </button>
      )}
    <div className="user-panel" ref={panelRef}>
      <button className="user-panel-me" aria-label={`Meu perfil (${presenceLabel[myStatus.status]})`} aria-haspopup="dialog"
        aria-expanded={profileOpen} title="Abrir perfil" onClick={() => { setAccountMenu(false); setProfileOpen((open) => !open) }}>
        <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} presence={myStatus.status} ringColor="var(--bg-panel)" />
        <span className="user-panel-names">
          <span className="user-panel-name">{user.displayName}</span>
          <span className="user-panel-handle">{myStatus.status === 'online' ? `@${user.username}` : presenceLabel[myStatus.status]}</span>
        </span>
      </button>
      <button className={`icon-button${micOff ? ' icon-button--off' : ''}`} aria-label={micOff ? 'Ligar microfone' : 'Desligar microfone'}
        aria-pressed={micOff} onClick={() => call.setMuted(!micOff)}>
        {micOff ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button className={`icon-button${call.prefs.deafened ? ' icon-button--off' : ''}`} aria-label={call.prefs.deafened ? 'Ligar som' : 'Desligar som'}
        aria-pressed={call.prefs.deafened} onClick={() => call.setDeafened(!call.prefs.deafened)}>
        {call.prefs.deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
      </button>
      <button className="icon-button" aria-label="Configurações da conta" aria-haspopup="menu" aria-expanded={accountMenu}
        onClick={() => setAccountMenu((open) => !open)}>
        <SettingsIcon />
      </button>

      {accountMenu && (
        <div className="user-menu" role="menu">
          <button role="menuitem" className="user-menu-item" autoFocus onClick={() => { setAccountMenu(false); setMediaOpen(true) }}>
            <MicIcon /> Voz e vídeo
          </button>
          <button role="menuitem" className="user-menu-item user-menu-item--danger" onClick={onSignOut}>
            <LogOutIcon /> Sair da conta
          </button>
        </div>
      )}
    </div>
      {profileOpen && (
        <ProfileCard user={user} onClose={() => setProfileOpen(false)}
          onOpenMedia={() => { setProfileOpen(false); setMediaOpen(true) }} />
      )}
      {mediaOpen && <MediaSettingsModal settings={call.mediaSettings} onChange={call.setMediaSettings} onClose={() => setMediaOpen(false)} />}
    </>
  )
}
