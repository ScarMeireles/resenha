import { useEffect, useState } from 'react'
import type { Track } from 'livekit-client'
import { Avatar } from '../components/Avatar'
import { HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon, PhoneOffIcon, ScreenShareIcon, VideoIcon, VideoOffIcon } from '../components/Icons'
import { mediaUrl, type User } from '../lib/api'
import { VideoTrackView } from '../components/VideoTrackView'
import { formatDuration, formatScreenLabel, pickStage, type MicPrefs, type ParticipantView } from '../lib/voice'
import './CallView.css'

interface Props {
  /** Ex.: ["Churrasco", "Sala de voz"] ou ["Ana"]. */
  crumbs: string[]
  connecting: boolean
  participants: ParticipantView[]
  resolve(userId: string): User | undefined
  connectedAt: number | null
  prefs: MicPrefs
  cameraOn: boolean
  onToggleCamera(): void
  screenSharing: boolean
  onShareScreen(): void
  onStopScreen(): void
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

/** Altura real do vídeo que está chegando (vale para a sua tela e para a remota); null enquanto ele não começou. */
function trackHeight(track: Track): number | null {
  return track.mediaStreamTrack.getSettings().height ?? null
}

/** Tela da chamada de voz: grade de participantes e barra de controles. Câmera ligada mostra o vídeo no lugar do avatar; com alguém compartilhando tela, ela vira o palco e as pessoas ficam numa faixa embaixo. */
export function CallView({ crumbs, connecting, participants, resolve, connectedAt, prefs, cameraOn, onToggleCamera, screenSharing, onShareScreen, onStopScreen, onToggleMic, onToggleDeafen, onLeave }: Props) {
  const elapsed = useElapsedSeconds(connectedAt)
  const count = participants.length
  const micOff = prefs.muted || prefs.deafened
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const stage = pickStage(participants, focusedId)
  const nameOf = (p: ParticipantView) => (p.isLocal ? 'Você' : resolve(p.id)?.displayName ?? 'Alguém')

  return (
    <main className={`content call${stage ? ' call--stage' : ''}`}>
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

      {stage?.screen && (
        <div className="call-stage">
          <VideoTrackView track={stage.screen} />
          <span className="call-stage-label">{formatScreenLabel(nameOf(stage), trackHeight(stage.screen), stage.screenAudio)}</span>
        </div>
      )}

      <ul className={stage ? 'call-grid call-strip' : 'call-grid'}>
        {participants.map((p) => {
          const user = resolve(p.id)
          const name = nameOf(p)
          return (
            <li key={p.id} className={`call-tile${p.isSpeaking ? ' call-tile--speaking' : ''}`}>
              {p.camera
                ? <VideoTrackView track={p.camera} mirror={p.isLocal} />
                : <Avatar name={user?.displayName ?? name} seed={p.id} src={mediaUrl(user?.avatarUrl ?? null)} size={64} />}
              <span className="call-tile-label">
                {p.isMuted && <span className="call-tile-muted" role="img" aria-label="Microfone desligado"><MicOffIcon size={14} /></span>}
                {name}{p.isSpeaking ? ' · falando' : ''}
              </span>
            </li>
          )
        })}
        {/* Outras telas compartilhadas: um tile extra para trocar o palco. */}
        {stage && participants.filter((p) => p.screen && p.id !== stage.id).map((p) => (
          <li key={`tela-${p.id}`} className="call-tile call-tile--screen">
            <button type="button" className="call-tile-switch" onClick={() => setFocusedId(p.id)}
              aria-label={`Ver a tela de ${nameOf(p)}`}>
              <ScreenShareIcon size={22} />
              <span>{p.isLocal ? 'Sua tela' : `Tela de ${nameOf(p)}`}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="call-controls" role="toolbar" aria-label="Controles da chamada">
        <button className={`call-btn${micOff ? ' call-btn--off' : ''}`} onClick={onToggleMic}
          aria-label={micOff ? 'Ligar microfone' : 'Desligar microfone'} aria-pressed={micOff}>
          {micOff ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
        </button>
        {/* Câmera desligada é o estado normal: botão neutro (só o ícone muda), diferente do mic mutado. */}
        <button className="call-btn" onClick={onToggleCamera}
          aria-label={cameraOn ? 'Desligar câmera' : 'Ligar câmera'} aria-pressed={cameraOn}>
          {cameraOn ? <VideoIcon size={22} /> : <VideoOffIcon size={22} />}
        </button>
        <button className={`call-btn${screenSharing ? ' call-btn--active' : ''}`} onClick={screenSharing ? onStopScreen : onShareScreen}
          aria-label={screenSharing ? 'Parar de compartilhar a tela' : 'Compartilhar tela'} aria-pressed={screenSharing}>
          <ScreenShareIcon size={22} />
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
