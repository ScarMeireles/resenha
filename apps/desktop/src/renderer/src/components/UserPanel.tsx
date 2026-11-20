import { useEffect, useRef, useState } from 'react'
import { mediaUrl, type User } from '../lib/api'
import { CHOSEN_STATUSES, presenceLabel } from '../lib/presence'
import { Avatar } from './Avatar'
import { MediaSettingsModal } from './MediaSettingsModal'
import { useCallContext } from '../hooks/useCall'
import { useMyStatusContext } from '../hooks/useMyStatus'
import { HeadphonesIcon, HeadphonesOffIcon, LogOutIcon, MicIcon, MicOffIcon, PhoneIcon, SettingsIcon } from './Icons'

type Menu = 'status' | 'account' | null

/** Rodapé da barra lateral: quem sou eu (clicar no avatar troca o status), microfone/som e o menu da conta. */
export function UserPanel({ user, onSignOut }: { user: User; onSignOut(): void }) {
  const call = useCallContext()
  const myStatus = useMyStatusContext()
  const micOff = call.prefs.muted || call.prefs.deafened
  const [menu, setMenu] = useState<Menu>(null)
  const [mediaOpen, setMediaOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menu) return
    const onPointer = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const toggle = (which: Exclude<Menu, null>) => setMenu((open) => (open === which ? null : which))

  return (
    <>
      {call.state.current && call.state.current.status !== 'ringing-out' && !call.viewing && (
        <button className="call-bar" onClick={() => call.setViewing(true)}>
          <PhoneIcon size={16} /> Em chamada{call.label ? ` · ${call.label}` : ''} <span className="call-bar-back">Voltar</span>
        </button>
      )}
    <div className="user-panel" ref={panelRef}>
      <button className="user-panel-me" aria-label={`Status: ${presenceLabel[myStatus.status]}. Trocar status`} aria-haspopup="menu"
        aria-expanded={menu === 'status'} onClick={() => toggle('status')}>
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
      <button className="icon-button" aria-label="Configurações da conta" aria-haspopup="menu" aria-expanded={menu === 'account'}
        onClick={() => toggle('account')}>
        <SettingsIcon />
      </button>

      {menu === 'status' && (
        <div className="user-menu" role="menu" aria-label="Status">
          {CHOSEN_STATUSES.map(({ value, hint }) => (
            <button key={value} role="menuitemradio" aria-checked={myStatus.status === value} className="user-menu-item user-menu-status"
              autoFocus={myStatus.status === value} onClick={() => { setMenu(null); void myStatus.setStatus(value) }}>
              <span className={`status-dot status-dot--${value}`} aria-hidden="true" />
              <span className="user-menu-status-text">
                <span>{presenceLabel[value]}</span>
                <span className="user-menu-hint">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {menu === 'account' && (
        <div className="user-menu" role="menu">
          <button role="menuitem" className="user-menu-item" autoFocus onClick={() => { setMenu(null); setMediaOpen(true) }}>
            <MicIcon /> Voz e vídeo
          </button>
          <button role="menuitem" className="user-menu-item user-menu-item--danger" onClick={onSignOut}>
            <LogOutIcon /> Sair da conta
          </button>
        </div>
      )}
    </div>
      {mediaOpen && <MediaSettingsModal settings={call.mediaSettings} onChange={call.setMediaSettings} onClose={() => setMediaOpen(false)} />}
    </>
  )
}
