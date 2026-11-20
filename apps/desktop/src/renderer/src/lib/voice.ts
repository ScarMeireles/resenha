import { LocalAudioTrack, RemoteTrack, Room, RoomEvent, Track, type Participant } from 'livekit-client'
import type { ScreenAudioChoice } from '../../../preload/bridge'
import { buildRoomOptions, buildScreenAudioPublish, buildScreenShareOptions, DEFAULT_MEDIA_SETTINGS, type MediaSettings } from './mediaSettings'
import { startHelperAudio, type HelperAudio } from './screenAudio'

/** Camada fina sobre o livekit-client: conecta na sala, controla mic/som e entrega dados prontos para a tela. */

export interface VoiceCredentials {
  url: string
  token: string
}

export interface ParticipantView {
  /** Identidade no LiveKit = id do usuário. */
  id: string
  isLocal: boolean
  isSpeaking: boolean
  isMuted: boolean
  /** Vídeo da câmera, quando está ligada e disponível; senão null (a tela mostra o avatar). */
  camera: Track | null
  /** Vídeo da tela compartilhada, com a mesma regra da câmera. */
  screen: Track | null
  /** Esta pessoa também compartilha o áudio do computador. */
  screenAudio: boolean
}

/** O pouco que precisamos de um Participant do LiveKit (facilita testar sem rede). */
export interface RawParticipant {
  identity: string
  isLocal: boolean
  isSpeaking: boolean
  isMicrophoneEnabled: boolean
  cameraTrack: Track | null
  screenTrack: Track | null
  hasScreenAudio: boolean
}

/** Você primeiro, depois os outros por identidade (ordem estável, sem "pular" na tela). */
export function toParticipantViews(raw: RawParticipant[]): ParticipantView[] {
  return raw
    .map((p) => ({ id: p.identity, isLocal: p.isLocal, isSpeaking: p.isSpeaking, isMuted: !p.isMicrophoneEnabled, camera: p.cameraTrack, screen: p.screenTrack, screenAudio: p.hasScreenAudio }))
    .sort((a, b) => (a.isLocal === b.isLocal ? a.id.localeCompare(b.id) : a.isLocal ? -1 : 1))
}

/** "Tela de Ana · 1080p · com áudio"; para você, "Sua tela · 1080p". Sem altura ou sem áudio, omite a parte. */
export function formatScreenLabel(name: string, height: number | null, audio: boolean): string {
  const parts = [name === 'Você' ? 'Sua tela' : `Tela de ${name}`]
  if (height) parts.push(`${height}p`)
  if (audio) parts.push('com áudio')
  return parts.join(' · ')
}

/** Quem vai no palco: o focado (se compartilha), senão o primeiro remoto que compartilha, senão você, senão ninguém. */
export function pickStage(participants: ParticipantView[], focusedId: string | null): ParticipantView | null {
  const sharing = participants.filter((p) => p.screen)
  return sharing.find((p) => p.id === focusedId) ?? sharing.find((p) => !p.isLocal) ?? sharing.find((p) => p.isLocal) ?? null
}

export interface MicPrefs {
  muted: boolean
  deafened: boolean
}

/** Ensurdecer também muta o microfone (como no Discord); ao desensurdecer, o mic volta ao que você tinha escolhido. */
export const micEnabled = ({ muted, deafened }: MicPrefs): boolean => !muted && !deafened

/** 3725 → "01:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export interface VoiceHandlers {
  onChange(participants: ParticipantView[]): void
  /** Queda da conexão por motivo que não foi o disconnect() chamado por nós. */
  onDropped(): void
  /** Aviso que não derruba a chamada (ex.: o som da tela parou). */
  onNotice(message: string): void
}

export interface VoiceConnection {
  setMuted(muted: boolean): Promise<void>
  setDeafened(deafened: boolean): Promise<void>
  /** Liga/desliga a câmera. Erros (sem câmera, permissão negada) sobem para quem chamou. */
  setCamera(enabled: boolean): Promise<void>
  /**
   * Liga/desliga o compartilhamento de tela (a fonte já foi escolhida no main). Erros da imagem sobem para quem chamou;
   * se só o som do ajudante falhar, a tela segue sem som e vem um aviso pelo onNotice.
   */
  setScreenShare(enabled: boolean, audio: ScreenAudioChoice): Promise<void>
  /**
   * Aplica as preferências de aparelho e ruído na hora. A qualidade nova (câmera/tela) só vale na próxima vez que
   * você ligar a câmera ou a tela. Erros sobem para quem chamou.
   */
  applySettings(next: MediaSettings): Promise<void>
  disconnect(): void
}

const toRaw = (p: Participant): RawParticipant => {
  const pub = p.getTrackPublication(Track.Source.Camera)
  const screenPub = p.getTrackPublication(Track.Source.ScreenShare)
  return {
    identity: p.identity,
    isLocal: p.isLocal,
    isSpeaking: p.isSpeaking,
    isMicrophoneEnabled: p.isMicrophoneEnabled,
    cameraTrack: pub && !pub.isMuted && pub.track ? pub.track : null,
    screenTrack: screenPub && !screenPub.isMuted && screenPub.track ? screenPub.track : null,
    hasScreenAudio: p.getTrackPublication(Track.Source.ScreenShareAudio) != null,
  }
}

/**
 * Argumentos do switchActiveDevice do LiveKit. "Padrão do sistema" (null) vai como 'default' sem `exact`: por padrão
 * o LiveKit pede o aparelho como restrição obrigatória, e a câmera não tem um aparelho chamado 'default' (o Chromium
 * recusa e a câmera ficava encerrada em silêncio). Sem `exact`, 'default' é só preferência e o sistema escolhe.
 */
export function deviceArgs(id: string | null): [deviceId: string, exact: boolean] {
  return id === null ? ['default', false] : [id, true]
}

export async function connectVoice(
  credentials: VoiceCredentials, initial: MicPrefs, handlers: VoiceHandlers, settings: MediaSettings = DEFAULT_MEDIA_SETTINGS,
): Promise<VoiceConnection> {
  const room = new Room(buildRoomOptions(settings))
  let current = settings

  const prefs: MicPrefs = { ...initial }
  // Elemento de áudio de cada faixa remota, pelo objeto da faixa. Guardamos nós mesmos porque, quando quem publica
  // para (ex.: fim do áudio da tela), o LiveKit já desanexou a faixa e o detach() volta vazio.
  const elements = new Map<RemoteTrack, HTMLMediaElement>()
  let closing = false
  // Som da tela no modo "todo o áudio, menos...": faixa própria, publicada à parte do vídeo da tela.
  let helperAudio: HelperAudio | null = null
  const stopHelperAudio = async () => {
    const audio = helperAudio
    helperAudio = null
    if (!audio) return
    audio.stop()
    await room.localParticipant.unpublishTrack(audio.track).catch(() => undefined)
  }

  const emit = () => handlers.onChange(toParticipantViews([room.localParticipant, ...room.remoteParticipants.values()].map(toRaw)))

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) {
        emit() // vídeo é anexado pela tela (VideoTrackView), não ao body
        return
      }
      const el = track.attach()
      el.style.display = 'none'
      el.muted = prefs.deafened
      document.body.appendChild(el)
      elements.get(track)?.remove()
      elements.set(track, el)
      emit()
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach()
      elements.get(track)?.remove()
      elements.delete(track)
      emit()
    })
    .on(RoomEvent.LocalTrackUnpublished, (pub) => {
      // A imagem da tela acabou (botão parar ou o sistema encerrou a captura): o som do ajudante vai junto.
      if (pub.source === Track.Source.ScreenShare) void stopHelperAudio()
    })
    .on(RoomEvent.Disconnected, () => {
      void stopHelperAudio()
      for (const el of elements.values()) el.remove()
      elements.clear()
      if (!closing) handlers.onDropped()
    })

  for (const event of [
    RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ActiveSpeakersChanged,
    RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
    RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.Connected,
  ]) {
    room.on(event, emit)
  }

  await room.connect(credentials.url, credentials.token)
  await room.localParticipant.setMicrophoneEnabled(micEnabled(prefs))
  emit()

  return {
    async setMuted(muted) {
      prefs.muted = muted
      await room.localParticipant.setMicrophoneEnabled(micEnabled(prefs))
      emit()
    },
    async setDeafened(deafened) {
      prefs.deafened = deafened
      for (const el of elements.values()) el.muted = deafened
      await room.localParticipant.setMicrophoneEnabled(micEnabled(prefs))
      emit()
    },
    async setCamera(enabled) {
      await room.localParticipant.setCameraEnabled(enabled)
      emit()
    },
    async setScreenShare(enabled, audio) {
      await stopHelperAudio()
      const { capture, publish } = buildScreenShareOptions(current, audio.mode === 'all')
      await room.localParticipant.setScreenShareEnabled(enabled, capture, publish)
      if (enabled && audio.mode === 'except') {
        try {
          const started = await startHelperAudio({ resenha: audio.resenha, exes: audio.exes }, () => {
            void stopHelperAudio()
            handlers.onNotice('O som da tela parou. A imagem continua.')
          })
          helperAudio = started
          await room.localParticipant.publishTrack(started.track, { source: Track.Source.ScreenShareAudio, ...buildScreenAudioPublish(current) })
        } catch {
          await stopHelperAudio()
          handlers.onNotice('Não foi possível capturar o som. A tela está sendo compartilhada sem áudio.')
        }
      }
      emit()
    },
    async applySettings(next) {
      const prev = current
      current = next
      if (next.audioInputId !== prev.audioInputId) await room.switchActiveDevice('audioinput', ...deviceArgs(next.audioInputId))
      if (next.audioOutputId !== prev.audioOutputId) await room.switchActiveDevice('audiooutput', ...deviceArgs(next.audioOutputId))
      if (next.videoInputId !== prev.videoInputId) await room.switchActiveDevice('videoinput', ...deviceArgs(next.videoInputId))
      if (next.noiseSuppression !== prev.noiseSuppression) {
        const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
        if (track instanceof LocalAudioTrack) {
          await track.restartTrack({
            deviceId: next.audioInputId ?? undefined, echoCancellation: true, noiseSuppression: next.noiseSuppression, autoGainControl: true,
          })
        }
      }
    },
    disconnect() {
      closing = true
      void stopHelperAudio()
      void room.disconnect()
    },
  }
}
