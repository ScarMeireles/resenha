import { useEffect, useRef, useState } from 'react'
import type { Track } from 'livekit-client'
import { Avatar } from '../components/Avatar'
import {
  ChevronUpIcon, HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon, PhoneOffIcon, PopoutIcon, ScreenShareIcon, VideoIcon, VideoOffIcon,
} from '../components/Icons'
import { SharePopover } from '../components/SharePopover'
import { VideoTrackView } from '../components/VideoTrackView'
import { VoiceMenu } from '../components/VoiceMenu'
import { Watch } from '../components/Watch'
import type { ScreenShareInfo } from '../hooks/useCall'
import { mediaUrl, type User } from '../lib/api'
import type { QualityPreset } from '../lib/mediaSettings'
import { formatDuration, formatScreenLabel, pickStage, type MicPrefs, type ParticipantView } from '../lib/voice'
import { personAudio, type AudioKind, type PersonVolume, type VolumeMap } from '../lib/volumePrefs'
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
  /** O que você está compartilhando (nome e som), para a caixinha do botão da tela. */
  share: ScreenShareInfo | null
  quality: QualityPreset
  onScreenQuality(q: QualityPreset): void
  onScreenAudio(on: boolean): void
  onShareScreen(): void
  onSwapScreen(): void
  onStopScreen(): void
  onToggleMic(): void
  onToggleDeafen(): void
  onLeave(): void
  /** Volume de cada pessoa, só para você. */
  volumes: VolumeMap
  onPersonVolume(userId: string, kind: AudioKind, patch: Partial<PersonVolume>): void
  /** Pessoa cuja tela está na janela separada. */
  popoutId: string | null
  onPopout(userId: string | null): void
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

/**
 * Tela da chamada de voz: grade de participantes e barra de controles. Câmera ligada mostra o vídeo no lugar do avatar;
 * com alguém compartilhando tela, ela vira o palco e as pessoas ficam numa faixa embaixo. A tela de um amigo tem a
 * barra de "assistindo"; a sua tem a caixinha no botão do monitor. Botão direito numa pessoa regula a voz dela.
 */
export function CallView(props: Props) {
  const { crumbs, connecting, participants, resolve, connectedAt, prefs, cameraOn, onToggleCamera, screenSharing, onShareScreen, onToggleMic, onToggleDeafen, onLeave } = props
  const elapsed = useElapsedSeconds(connectedAt)
  const count = participants.length
  const micOff = prefs.muted || prefs.deafened
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const shareBtn = useRef<HTMLButtonElement>(null)
  const stage = pickStage(participants, focusedId)
  const nameOf = (p: ParticipantView) => (p.isLocal ? 'Você' : resolve(p.id)?.displayName ?? 'Alguém')
  const me = participants.find((p) => p.isLocal)
  const menuPerson = menu ? participants.find((p) => p.id === menu.id && !p.isLocal) : undefined

  // Parou de compartilhar (inclusive pelo sistema): a caixinha some junto.
  useEffect(() => {
    if (!screenSharing) setShareOpen(false)
  }, [screenSharing])

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
          {stage.isLocal ? (
            <>
              <VideoTrackView track={stage.screen} />
              <span className="call-stage-label">{formatScreenLabel(nameOf(stage), trackHeight(stage.screen), stage.screenAudio)}</span>
            </>
          ) : stage.id === props.popoutId ? (
            <div className="popped">
              <PopoutIcon size={32} />
              <b>Aberta em janela separada</b>
              <span>A tela de {nameOf(stage)} está em outra janela.</span>
              <button type="button" className="btn-ghost" onClick={() => props.onPopout(null)}>Trazer de volta</button>
            </div>
          ) : (
            <Watch track={stage.screen} label={formatScreenLabel(nameOf(stage), trackHeight(stage.screen), stage.screenAudio)} inPopout={false}
              volume={personAudio(props.volumes, stage.id).screen} hasAudio={stage.screenAudio}
              onVolume={(patch) => props.onPersonVolume(stage.id, 'screen', patch)} onPopToggle={() => props.onPopout(stage.id)} />
          )}
        </div>
      )}

      <ul className={stage ? 'call-grid call-strip' : 'call-grid'}>
        {participants.map((p) => {
          const user = resolve(p.id)
          const name = nameOf(p)
          const voice = personAudio(props.volumes, p.id).voice
          return (
            <li key={p.id} className={`call-tile${p.isSpeaking ? ' call-tile--speaking' : ''}`}
              onContextMenu={p.isLocal ? undefined : (e) => { e.preventDefault(); setMenu({ id: p.id, x: e.clientX, y: e.clientY }) }}
              title={p.isLocal ? undefined : 'Botão direito: volume da voz'}>
              {p.camera
                ? <VideoTrackView track={p.camera} mirror={p.isLocal} />
                : <Avatar name={user?.displayName ?? name} seed={p.id} src={mediaUrl(user?.avatarUrl ?? null)} size={64} />}
              <span className="call-tile-label">
                {p.isMuted && <span className="call-tile-muted" role="img" aria-label="Microfone desligado"><MicOffIcon size={14} /></span>}
                {!p.isLocal && voice.muted && <span className="call-tile-muted" role="img" aria-label="Silenciado para você"><HeadphonesOffIcon size={14} /></span>}
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
        {/* Compartilhando, o botão não para mais na hora: abre a caixinha com as opções (e o "Parar"). */}
        <div className="call-share">
          <button ref={shareBtn} className={`call-btn${screenSharing ? ' call-btn--active' : ''}`}
            onClick={screenSharing ? () => setShareOpen((o) => !o) : onShareScreen}
            aria-label={screenSharing ? 'Opções do compartilhamento' : 'Compartilhar tela'}
            aria-expanded={screenSharing ? shareOpen : undefined} aria-haspopup={screenSharing ? 'dialog' : undefined}>
            <ScreenShareIcon size={22} />
            {screenSharing && <span className="call-btn-caret" aria-hidden="true"><ChevronUpIcon size={10} /></span>}
          </button>
          {screenSharing && shareOpen && (
            <SharePopover anchor={shareBtn} track={me?.screen ?? null} sourceName={props.share?.name ?? null}
              watchers={participants.filter((p) => !p.isLocal).map(nameOf)}
              quality={props.quality} onQuality={props.onScreenQuality}
              audio={props.share?.audio ?? null} audioPublished={me?.screenAudioPublished ?? false} audioOn={me?.screenAudio ?? false}
              onAudio={props.onScreenAudio}
              onSwap={() => { setShareOpen(false); props.onSwapScreen() }}
              onStop={() => { setShareOpen(false); props.onStopScreen() }}
              onClose={() => setShareOpen(false)} />
          )}
        </div>
        <button className={`call-btn${prefs.deafened ? ' call-btn--off' : ''}`} onClick={onToggleDeafen}
          aria-label={prefs.deafened ? 'Ligar som' : 'Desligar som'} aria-pressed={prefs.deafened}>
          {prefs.deafened ? <HeadphonesOffIcon size={22} /> : <HeadphonesIcon size={22} />}
        </button>
        <button className="call-btn call-btn--leave" onClick={onLeave} aria-label="Sair da chamada">
          <PhoneOffIcon size={22} />
        </button>
      </div>

      {menu && menuPerson && (
        <VoiceMenu name={nameOf(menuPerson)} x={menu.x} y={menu.y} volume={personAudio(props.volumes, menuPerson.id).voice}
          onVolume={(patch) => props.onPersonVolume(menuPerson.id, 'voice', patch)} onClose={() => setMenu(null)} />
      )}
    </main>
  )
}
