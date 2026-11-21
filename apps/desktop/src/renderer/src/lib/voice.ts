import { LocalAudioTrack, LocalVideoTrack, RemoteParticipant, RemoteTrack, Room, RoomEvent, Track, type Participant } from 'livekit-client'
import type { ScreenAudioChoice } from '../../../preload/bridge'
import {
  buildRoomOptions, buildScreenAudioPublish, buildScreenShareOptions, DEFAULT_MEDIA_SETTINGS, screenVideoConstraints, type MediaSettings,
} from './mediaSettings'
import { startHelperAudio, type HelperAudio } from './screenAudio'
import { sameAudioChoice } from './screenShare'
import { effectiveVolume, type VolumeMap } from './volumePrefs'

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
  /** Esta pessoa também compartilha o áudio do computador (e ele não está desligado). */
  screenAudio: boolean
  /** Existe faixa de som da tela, mesmo desligada pela chave "Som da tela". */
  screenAudioPublished: boolean
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
  screenAudioPublished: boolean
}

/** Você primeiro, depois os outros por identidade (ordem estável, sem "pular" na tela). */
export function toParticipantViews(raw: RawParticipant[]): ParticipantView[] {
  return raw
    .map((p) => ({ id: p.identity, isLocal: p.isLocal, isSpeaking: p.isSpeaking, isMuted: !p.isMicrophoneEnabled, camera: p.cameraTrack, screen: p.screenTrack, screenAudio: p.hasScreenAudio, screenAudioPublished: p.screenAudioPublished }))
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
   * Troca a tela ou janela sem encerrar o compartilhamento: captura a fonte nova e troca a faixa no mesmo envio
   * (replaceTrack), então quem assiste não perde a transmissão. O som só é refeito se o modo dele mudou.
   * Se a captura nova falhar, a antiga continua e o erro sobe para quem chamou.
   */
  switchScreenSource(sourceId: string, audio: ScreenAudioChoice): Promise<void>
  /** Chave "Som da tela": liga/desliga só o som que vai junto com a tela (o modo continua o mesmo). */
  setScreenAudioEnabled(enabled: boolean): Promise<void>
  /** Volume de cada pessoa (voz e som da tela), só para você. */
  setVolumes(volumes: VolumeMap): void
  /**
   * Aplica as preferências na hora: aparelhos, ruído e, se a tela estiver sendo compartilhada, a qualidade dela.
   * A qualidade da câmera só vale na próxima vez que você ligar a câmera. Erros de aparelho sobem para quem chamou.
   */
  applySettings(next: MediaSettings): Promise<void>
  disconnect(): void
}

const toRaw = (p: Participant): RawParticipant => {
  const pub = p.getTrackPublication(Track.Source.Camera)
  const screenPub = p.getTrackPublication(Track.Source.ScreenShare)
  const screenAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio)
  return {
    identity: p.identity,
    isLocal: p.isLocal,
    isSpeaking: p.isSpeaking,
    isMicrophoneEnabled: p.isMicrophoneEnabled,
    cameraTrack: pub && !pub.isMuted && pub.track ? pub.track : null,
    screenTrack: screenPub && !screenPub.isMuted && screenPub.track ? screenPub.track : null,
    hasScreenAudio: screenAudioPub != null && !screenAudioPub.isMuted,
    screenAudioPublished: screenAudioPub != null,
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
  initialVolumes: VolumeMap = {},
): Promise<VoiceConnection> {
  const room = new Room(buildRoomOptions(settings))
  let current = settings
  let volumes = initialVolumes

  const prefs: MicPrefs = { ...initial }
  // Elemento de áudio de cada faixa remota, pelo objeto da faixa. Guardamos nós mesmos porque, quando quem publica
  // para (ex.: fim do áudio da tela), o LiveKit já desanexou a faixa e o detach() volta vazio. Com o webAudioMix
  // o elemento fica mudo (o som sai pelo Web Audio), mas o Chromium precisa dele para a faixa remota tocar.
  const elements = new Map<RemoteTrack, HTMLMediaElement>()
  let closing = false
  // Som da tela no modo "todo o áudio, menos...": faixa própria, publicada à parte do vídeo da tela.
  let helperAudio: HelperAudio | null = null
  // Modo de som do compartilhamento atual e a chave "Som da tela" (desligada = faixa publicada, mas muda).
  let screenAudioChoice: ScreenAudioChoice = { mode: 'none' }
  let screenAudioOff = false
  // Enquanto a tela é republicada (troca de qualidade), o fim da publicação antiga não encerra o som.
  let republishing = false

  /**
   * Volume de uma pessoa no LiveKit. Com o webAudioMix, setVolume mexe no GainNode da faixa, então 2.0 é ganho de
   * verdade (+6 dB) e não para em 1.0 como o volume de um <audio>. Ensurdecer também passa por aqui (volume 0).
   * O RemoteParticipant guarda o valor e aplica nas faixas que chegarem depois.
   */
  const applyVolumes = (p: RemoteParticipant) => {
    p.setVolume(effectiveVolume(volumes, p.identity, 'voice', prefs.deafened), Track.Source.Microphone)
    p.setVolume(effectiveVolume(volumes, p.identity, 'screen', prefs.deafened), Track.Source.ScreenShareAudio)
  }
  const applyAllVolumes = () => {
    for (const p of room.remoteParticipants.values()) applyVolumes(p)
  }

  const screenAudioTrack = () => room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track
  const stopHelperAudio = async () => {
    const audio = helperAudio
    helperAudio = null
    if (!audio) return
    audio.stop()
    await room.localParticipant.unpublishTrack(audio.track).catch(() => undefined)
  }
  /** Para o som da tela, venha ele do ajudante ou do "todo o áudio". */
  const stopScreenAudio = async () => {
    await stopHelperAudio()
    const track = screenAudioTrack()
    if (track) await room.localParticipant.unpublishTrack(track).catch(() => undefined)
  }
  /** Começa o som da tela no modo escolhido; `loopback` é o "todo o áudio" que veio junto com a captura da imagem. */
  const startScreenAudio = async (audio: ScreenAudioChoice, loopback?: MediaStreamTrack) => {
    if (audio.mode === 'all') {
      if (!loopback) {
        handlers.onNotice('Não foi possível capturar o som. A tela está sendo compartilhada sem áudio.')
        return
      }
      await room.localParticipant.publishTrack(loopback, { source: Track.Source.ScreenShareAudio, ...buildScreenAudioPublish(current) })
    } else if (audio.mode === 'except') {
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
    if (screenAudioOff) await screenAudioTrack()?.mute()
  }

  /**
   * Nova qualidade na tela que já está indo. A captura continua a mesma (só recebe as restrições novas de tamanho e
   * fps); o que muda é a codificação. O LiveKit calcula bitrate e camadas de simulcast na hora de publicar e não tem
   * como trocar isso numa faixa já publicada, então a mesma faixa é despublicada sem parar e publicada de novo. Quem
   * assiste vê um corte curto (menos de um segundo), e você não precisa escolher a tela de novo.
   */
  const republishScreen = async () => {
    const lp = room.localParticipant
    const video = lp.getTrackPublication(Track.Source.ScreenShare)?.track
    if (!(video instanceof LocalVideoTrack)) return
    const { publish } = buildScreenShareOptions(current, false)
    // Pode falhar se a fonte não aceitar (ex.: janela pequena); a codificação nova vale mesmo assim.
    await video.mediaStreamTrack.applyConstraints(screenVideoConstraints(current.quality)).catch(() => undefined)
    const audio = screenAudioTrack()
    republishing = true
    try {
      await lp.unpublishTrack(video, false)
      await lp.publishTrack(video, { source: Track.Source.ScreenShare, ...publish })
      if (audio) {
        await lp.unpublishTrack(audio, false)
        await lp.publishTrack(audio, { source: Track.Source.ScreenShareAudio, ...buildScreenAudioPublish(current) })
      }
    } finally {
      republishing = false
    }
  }

  // Durante a republicação a tela some e volta por um instante; a tela do app não precisa piscar junto.
  const emit = () => !republishing && handlers.onChange(toParticipantViews([room.localParticipant, ...room.remoteParticipants.values()].map(toRaw)))

  room
    .on(RoomEvent.ParticipantConnected, applyVolumes)
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) {
        emit() // vídeo é anexado pela tela (VideoTrackView), não ao body
        return
      }
      const el = track.attach()
      el.style.display = 'none'
      document.body.appendChild(el)
      elements.get(track)?.remove()
      elements.set(track, el)
      applyVolumes(participant)
      emit()
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach()
      elements.get(track)?.remove()
      elements.delete(track)
      emit()
    })
    .on(RoomEvent.LocalTrackUnpublished, (pub) => {
      // A imagem da tela acabou (botão parar ou o sistema encerrou a captura): o som vai junto.
      if (pub.source === Track.Source.ScreenShare && !republishing) {
        screenAudioChoice = { mode: 'none' }
        void stopScreenAudio()
      }
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
  applyAllVolumes() // quem já estava na sala antes de você
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
      applyAllVolumes()
      await room.localParticipant.setMicrophoneEnabled(micEnabled(prefs))
      emit()
    },
    async setCamera(enabled) {
      await room.localParticipant.setCameraEnabled(enabled)
      emit()
    },
    async setScreenShare(enabled, audio) {
      await stopHelperAudio()
      screenAudioOff = false
      screenAudioChoice = enabled ? audio : { mode: 'none' }
      const { capture, publish } = buildScreenShareOptions(current, audio.mode === 'all')
      await room.localParticipant.setScreenShareEnabled(enabled, capture, publish)
      if (enabled && audio.mode === 'except') await startScreenAudio(audio)
      emit()
    },
    async switchScreenSource(sourceId, audio) {
      const video = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track
      if (!(video instanceof LocalVideoTrack)) throw new Error('Nenhuma tela está sendo compartilhada.')
      const keepAudio = sameAudioChoice(screenAudioChoice, audio)
      const loopback = !keepAudio && audio.mode === 'all'
      // O main entrega a fonte nova no próximo getDisplayMedia; o "todo o áudio" só vem junto se for preciso refazê-lo.
      await window.resenha.screen.choose({ sourceId, audio: loopback ? { mode: 'all' } : { mode: 'none' } })
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: screenVideoConstraints(current.quality), audio: loopback })
      const [next] = stream.getVideoTracks()
      try {
        if (!next) throw new Error('A captura nova veio sem imagem.')
        next.contentHint = 'motion'
        // false = a faixa nova passa a ser do LiveKit: ele para a captura antiga agora e esta quando a tela acabar.
        await video.replaceTrack(next, false)
      } catch (error) {
        for (const t of stream.getTracks()) t.stop()
        throw error
      }
      if (!keepAudio) {
        await stopScreenAudio()
        screenAudioChoice = audio
        await startScreenAudio(audio, stream.getAudioTracks()[0])
      }
      emit()
    },
    async setScreenAudioEnabled(enabled) {
      screenAudioOff = !enabled
      const track = screenAudioTrack()
      if (track) await (enabled ? track.unmute() : track.mute())
      emit()
    },
    setVolumes(next) {
      volumes = next
      applyAllVolumes()
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
      if (next.quality !== prev.quality) {
        await republishScreen().catch(() => handlers.onNotice('Não foi possível aplicar a nova qualidade na tela.'))
        emit()
      }
    },
    disconnect() {
      closing = true
      void stopHelperAudio()
      void room.disconnect()
    },
  }
}
