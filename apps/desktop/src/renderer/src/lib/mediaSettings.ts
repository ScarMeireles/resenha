import { AudioPresets, ScreenSharePresets, VideoPresets, type AudioPreset, type RoomOptions, type VideoEncoding, type VideoPreset, type VideoResolution } from 'livekit-client'

/** Preferências de áudio e vídeo da chamada, guardadas no localStorage. null = padrão do sistema. */

export type QualityPreset = 'economia' | 'normal' | 'alta'

export interface MediaSettings {
  audioInputId: string | null
  audioOutputId: string | null
  videoInputId: string | null
  noiseSuppression: boolean
  quality: QualityPreset
}

export const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  audioInputId: null,
  audioOutputId: null,
  videoInputId: null,
  noiseSuppression: true,
  quality: 'normal',
}

export const MEDIA_SETTINGS_KEY = 'resenha.mediaSettings'

const QUALITIES: QualityPreset[] = ['economia', 'normal', 'alta']

const idOrNull = (v: unknown, fallback: string | null): string | null =>
  v === null ? null : typeof v === 'string' && v !== '' ? v : fallback

/** Lê as preferências; JSON quebrado ou campo inválido cai no padrão daquele campo. */
export function loadMediaSettings(storage: Pick<Storage, 'getItem'>): MediaSettings {
  let raw: unknown
  try {
    const text = storage.getItem(MEDIA_SETTINGS_KEY)
    raw = text ? JSON.parse(text) : null
  } catch {
    return { ...DEFAULT_MEDIA_SETTINGS }
  }
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_MEDIA_SETTINGS }
  const o = raw as Record<string, unknown>
  const d = DEFAULT_MEDIA_SETTINGS
  return {
    audioInputId: idOrNull(o.audioInputId, d.audioInputId),
    audioOutputId: idOrNull(o.audioOutputId, d.audioOutputId),
    videoInputId: idOrNull(o.videoInputId, d.videoInputId),
    noiseSuppression: typeof o.noiseSuppression === 'boolean' ? o.noiseSuppression : d.noiseSuppression,
    quality: QUALITIES.includes(o.quality as QualityPreset) ? (o.quality as QualityPreset) : d.quality,
  }
}

export function saveMediaSettings(storage: Pick<Storage, 'setItem'>, s: MediaSettings): void {
  try {
    storage.setItem(MEDIA_SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Sem armazenamento (cheio ou bloqueado): a preferência vale só nesta sessão.
  }
}

interface VideoQuality {
  resolution: VideoResolution
  encoding: VideoEncoding
  layers: VideoPreset[]
}

export interface QualityConfig {
  label: string
  description: string
  audio: AudioPreset
  /** Som da tela (jogo, vídeo, música): estéreo, sem DTX nem RED. */
  screenAudio: AudioPreset
  camera: VideoQuality
  screen: VideoQuality
}

// Opus com DTX (não gasta banda no silêncio) e RED (redundância contra perda de pacote) em todos os níveis.
// O vídeo fica em VP8 em todos: leve na CPU e decodificado em qualquer máquina. As camadas de simulcast servem
// a quem vê pequeno ou tem rede fraca. O nível Alta pesa na CPU de quem compartilha (1080p a 60 fps).
export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  economia: {
    label: 'Economia',
    description: 'Para internet fraca: voz 32 kbps, câmera 360p, tela 720p 15 fps.',
    audio: { maxBitrate: 32_000 },
    screenAudio: { maxBitrate: 64_000 },
    camera: { resolution: VideoPresets.h360.resolution, encoding: VideoPresets.h360.encoding, layers: [VideoPresets.h180] },
    // Captura já a 15 fps: capturar a 30 para o codificador jogar metade fora só gastaria CPU.
    screen: { resolution: { ...VideoPresets.h720.resolution, frameRate: 15 }, encoding: ScreenSharePresets.h720fps15.encoding, layers: [] },
  },
  normal: {
    label: 'Normal',
    description: 'Equilíbrio (padrão): voz 48 kbps, câmera 720p, tela 1080p 30 fps.',
    audio: AudioPresets.music,
    screenAudio: { maxBitrate: 96_000 },
    camera: { resolution: VideoPresets.h720.resolution, encoding: VideoPresets.h720.encoding, layers: [VideoPresets.h180, VideoPresets.h360] },
    screen: { resolution: VideoPresets.h1080.resolution, encoding: ScreenSharePresets.h1080fps30.encoding, layers: [ScreenSharePresets.h720fps15] },
  },
  alta: {
    label: 'Alta',
    description: 'Internet boa e PC forte: voz 64 kbps, câmera 1080p, tela 1080p 60 fps.',
    audio: { maxBitrate: 64_000 }, // o preset musicHighQuality do LiveKit é 96 kbps; aqui vale o que o texto promete
    screenAudio: { maxBitrate: 128_000 },
    camera: { resolution: VideoPresets.h1080.resolution, encoding: VideoPresets.h1080.encoding, layers: [VideoPresets.h360, VideoPresets.h720] },
    screen: {
      resolution: { ...VideoPresets.h1080.resolution, frameRate: 60 },
      encoding: { maxBitrate: 8_000_000, maxFramerate: 60 },
      layers: [ScreenSharePresets.h720fps30],
    },
  },
}

/** "1080p · 30 fps": o que a tela compartilhada manda em cada nível (resolução máxima e quadros por segundo). */
export function screenQualitySummary(q: QualityPreset): string {
  const { resolution, encoding } = QUALITY_PRESETS[q].screen
  return `${resolution.height}p · ${encoding.maxFramerate ?? resolution.frameRate ?? 30} fps`
}

/**
 * Restrições de vídeo da captura de tela, no mesmo formato que o LiveKit usa no getDisplayMedia: tamanho como
 * "ideal" (a captura nunca aumenta a imagem; uma janela pequena continua pequena) e o fps do nível.
 * Serve para capturar uma fonte nova (trocar a tela) e para mudar a qualidade da captura que já está rodando.
 */
export function screenVideoConstraints(q: QualityPreset): MediaTrackConstraints {
  const { resolution } = QUALITY_PRESETS[q].screen
  return { width: { ideal: resolution.width }, height: { ideal: resolution.height }, frameRate: resolution.frameRate }
}

export function buildRoomOptions(s: MediaSettings): RoomOptions {
  const q = QUALITY_PRESETS[s.quality]
  return {
    // Sem pausar o vídeo quando a janela principal fica escondida: a transmissão pode estar na janela separada,
    // e o Windows marca como escondida a janela que está coberta (ex.: pelo jogo).
    adaptiveStream: { pauseVideoInBackground: false },
    dynacast: true,
    // Todo o áudio recebido passa pelo Web Audio: cada faixa ganha um GainNode, o que permite volume por pessoa
    // acima de 100% (um <audio> para em 1.0). Os elementos <audio> ficam mudos; o som sai pelo AudioContext.
    webAudioMix: true,
    audioCaptureDefaults: {
      deviceId: s.audioInputId ?? undefined,
      echoCancellation: true,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: true,
    },
    ...(s.audioOutputId ? { audioOutput: { deviceId: s.audioOutputId } } : {}),
    videoCaptureDefaults: { deviceId: s.videoInputId ?? undefined, resolution: q.camera.resolution },
    publishDefaults: {
      audioPreset: q.audio, dtx: true, red: true, forceStereo: false,
      videoCodec: 'vp8', simulcast: true,
      videoSimulcastLayers: q.camera.layers,
      videoEncoding: q.camera.encoding,
      screenShareSimulcastLayers: q.screen.layers,
    },
  }
}

/** Opções do compartilhamento de tela. 'motion' porque entre amigos o mais comum é jogo/vídeo. */
export function buildScreenShareOptions(s: MediaSettings, audio: boolean) {
  const q = QUALITY_PRESETS[s.quality].screen
  return {
    capture: { audio, resolution: q.resolution, contentHint: 'motion' as const },
    publish: { videoCodec: 'vp8' as const, screenShareEncoding: q.encoding, screenShareSimulcastLayers: q.layers, ...buildScreenAudioPublish(s) },
  }
}

/**
 * Publicação do som da tela. Estéreo porque jogo, filme e música usam os dois lados. Sem DTX porque ele corta
 * trechos baixos (bom para voz, mas em música dá falhas nos fade-outs). Sem RED porque a redundância dobraria
 * um fluxo que já é grande. Vale tanto para o "todo o áudio" do Electron quanto para a faixa do ajudante.
 */
export function buildScreenAudioPublish(s: MediaSettings) {
  return { audioPreset: QUALITY_PRESETS[s.quality].screenAudio, dtx: false, red: false, forceStereo: true }
}
