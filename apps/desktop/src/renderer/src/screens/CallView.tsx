import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon, PhoneOffIcon } from '../components/Icons'
import { mediaUrl, type User } from '../lib/api'
import { formatDuration, type MicPrefs, type ParticipantView } from '../lib/voice'
import './CallView.css'

interface Props {
  /** Ex.: ["Churrasco", "Sala de voz"] ou ["Ana"]. */
  crumbs: string[]
  connecting: boolean
  participants: ParticipantView[]
  resolve(userId: string): User | undefined
  connectedAt: number | null
  prefs: MicPrefs
  onToggleMic(): void
  onToggleDeafen(): void
  onLeave(): void
}

/** Segundos desde `since`, atualizando a cada segundo. */
function useElapsedSeconds(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])
  return since === null ? 0 : (now - since) / 1000
}

/** Tela da chamada de voz: grade de participantes e barra de controles. Câmera e tela chegam nos passos 7 e 8. */
export function CallView({ crumbs, connecting, participants, resolve, connectedAt, prefs, onToggleMic, onToggleDeafen, onLeave }: Props) {
  const elapsed = useElapsedSeconds(connectedAt)
  const count = participants.length
  const micOff = prefs.muted || prefs.deafened

  return (
    <main className="content call">
      <header className="call-header">
        <h2 className="call-crumbs">
          {crumbs.map((c, i) => (
            <span key={c} className={i === crumbs.length - 1 ? undefined : 'call-crumb-parent'}>
              {i > 0 && <span className="call-crumb-sep" aria-hidden="true"> › </span>}
              {c}
            </span>
          ))}
        </h2>
        <span className={`call-chip${connecting ? ' call-chip--waiting' : ''}`}>
          <span className="call-chip-dot" aria-hidden="true" /> {connecting ? 'Conectando…' : 'Conectado'}
        </span>
        <span className="call-meta">{count} {count === 1 ? 'pessoa' : 'pessoas'} · {formatDuration(elapsed)}</span>
      </header>

      <ul className="call-grid">
        {participants.map((p) => {
          const user = resolve(p.id)
          const name = p.isLocal ? 'Você' : user?.displayName ?? 'Alguém'
          return (
            <li key={p.id} className={`call-tile${p.isSpeaking ? ' call-tile--speaking' : ''}`}>
              <Avatar name={user?.displayName ?? name} seed={p.id} src={mediaUrl(user?.avatarUrl ?? null)} size={64} />
              <span className="call-tile-label">
                {p.isMuted && <span className="call-tile-muted" role="img" aria-label="Microfone desligado"><MicOffIcon size={14} /></span>}
                {name}{p.isSpeaking ? ' · falando' : ''}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="call-controls" role="toolbar" aria-label="Controles da chamada">
        <button className={`call-btn${micOff ? ' call-btn--off' : ''}`} onClick={onToggleMic}
          aria-label={micOff ? 'Ligar microfone' : 'Desligar microfone'} aria-pressed={micOff}>
          {micOff ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
        </button>
        <button className={`call-btn${prefs.deafened ? ' call-btn--off' : ''}`} onClick={onToggleDeafen}
          aria-label={prefs.deafened ? 'Ligar som' : 'Desligar som'} aria-pressed={prefs.deafened}>
          {prefs.deafened ? <HeadphonesOffIcon size={22} /> : <HeadphonesIcon size={22} />}
        </button>
        <button className="call-btn call-btn--leave" onClick={onLeave} aria-label="Sair da chamada">
          <PhoneOffIcon size={22} />
        </button>
      </div>
    </main>
  )
}
