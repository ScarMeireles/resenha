import { AudioPresets, RemoteTrack, Room, RoomEvent, ScreenSharePresets, Track, VideoPresets, type Participant } from 'livekit-client'

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
}

export interface VoiceConnection {
  setMuted(muted: boolean): Promise<void>
  setDeafened(deafened: boolean): Promise<void>
  /** Liga/desliga a câmera. Erros (sem câmera, permissão negada) sobem para quem chamou. */
  setCamera(enabled: boolean): Promise<void>
  /** Liga/desliga o compartilhamento de tela (a fonte já foi escolhida no main). Erros sobem para quem chamou. */
  setScreenShare(enabled: boolean, audio: boolean): Promise<void>
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

export async function connectVoice(credentials: VoiceCredentials, initial: MicPrefs, handlers: VoiceHandlers): Promise<VoiceConnection> {
  // Opus mono a 48 kbps (preset "music") com DTX (não gasta banda no silêncio) e RED (redundância contra
  // perda de pacote). Cancelamento de eco, ruído e ganho automático ligados. Presets ajustáveis no passo 9.
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    // Câmera: 720p 30 fps (~1,7 Mbps) com simulcast em 180p/360p para quem vê a câmera pequena ou tem rede
    // fraca; VP8 por ser leve na CPU e decodificado em qualquer máquina. Ajustes finos no passo 9.
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    publishDefaults: {
      audioPreset: AudioPresets.music, dtx: true, red: true, forceStereo: false,
      videoCodec: 'vp8', simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      videoEncoding: VideoPresets.h720.encoding,
    },
  })

  const prefs: MicPrefs = { ...initial }
  // Elemento de áudio de cada faixa remota, pelo objeto da faixa. Guardamos nós mesmos porque, quando quem publica
  // para (ex.: fim do áudio da tela), o LiveKit já desanexou a faixa e o detach() volta vazio.
  const elements = new Map<RemoteTrack, HTMLMediaElement>()
  let closing = false

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
    .on(RoomEvent.Disconnected, () => {
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
      // 1080p a 30 fps (~5 Mbps no topo) em VP8: leve, sem depender de GPU. 'motion' porque entre amigos o mais
      // comum é jogo/vídeo: com rede ruim o navegador baixa a resolução antes de travar o movimento.
      // 60 fps fica para os presets do passo 9.
      await room.localParticipant.setScreenShareEnabled(
        enabled,
        { audio, resolution: VideoPresets.h1080.resolution, contentHint: 'motion' },
        { videoCodec: 'vp8', screenShareEncoding: ScreenSharePresets.h1080fps30.encoding },
      )
      emit()
    },
    disconnect() {
      closing = true
      void room.disconnect()
    },
  }
}
