import { AudioPresets, RemoteTrack, Room, RoomEvent, Track, type Participant } from 'livekit-client'

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
}

/** O pouco que precisamos de um Participant do LiveKit (facilita testar sem rede). */
export interface RawParticipant {
  identity: string
  isLocal: boolean
  isSpeaking: boolean
  isMicrophoneEnabled: boolean
}

/** Você primeiro, depois os outros por identidade (ordem estável, sem "pular" na tela). */
export function toParticipantViews(raw: RawParticipant[]): ParticipantView[] {
  return raw
    .map((p) => ({ id: p.identity, isLocal: p.isLocal, isSpeaking: p.isSpeaking, isMuted: !p.isMicrophoneEnabled }))
    .sort((a, b) => (a.isLocal === b.isLocal ? a.id.localeCompare(b.id) : a.isLocal ? -1 : 1))
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
  disconnect(): void
}

const toRaw = (p: Participant): RawParticipant => ({
  identity: p.identity,
  isLocal: p.isLocal,
  isSpeaking: p.isSpeaking,
  isMicrophoneEnabled: p.isMicrophoneEnabled,
})

export async function connectVoice(credentials: VoiceCredentials, initial: MicPrefs, handlers: VoiceHandlers): Promise<VoiceConnection> {
  // Opus mono a 48 kbps (preset "music") com DTX (não gasta banda no silêncio) e RED (redundância contra
  // perda de pacote). Cancelamento de eco, ruído e ganho automático ligados. Presets ajustáveis no passo 9.
  const room = new Room({
    adaptiveStream: false,
    dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: { audioPreset: AudioPresets.music, dtx: true, red: true, forceStereo: false },
  })

  const prefs: MicPrefs = { ...initial }
  const elements = new Set<HTMLMediaElement>()
  let closing = false

  const emit = () => handlers.onChange(toParticipantViews([room.localParticipant, ...room.remoteParticipants.values()].map(toRaw)))

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return
      const el = track.attach()
      el.style.display = 'none'
      el.muted = prefs.deafened
      document.body.appendChild(el)
      elements.add(el)
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      for (const el of track.detach()) {
        el.remove()
        elements.delete(el)
      }
    })
    .on(RoomEvent.Disconnected, () => {
      for (const el of elements) el.remove()
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
      for (const el of elements) el.muted = deafened
      await room.localParticipant.setMicrophoneEnabled(micEnabled(prefs))
      emit()
    },
    disconnect() {
      closing = true
      void room.disconnect()
    },
  }
}
