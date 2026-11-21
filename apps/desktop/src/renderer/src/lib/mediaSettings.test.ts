import { describe, expect, it } from 'vitest'
import {
  buildRoomOptions, buildScreenAudioPublish, buildScreenShareOptions, DEFAULT_MEDIA_SETTINGS, loadMediaSettings, MEDIA_SETTINGS_KEY, saveMediaSettings,
  screenQualitySummary, screenVideoConstraints, type MediaSettings,
} from './mediaSettings'

const store = (value: string | null) => ({ getItem: (k: string) => (k === MEDIA_SETTINGS_KEY ? value : null) })
const settings = (extra: Partial<MediaSettings> = {}): MediaSettings => ({ ...DEFAULT_MEDIA_SETTINGS, ...extra })

describe('loadMediaSettings', () => {
  it('storage vazio devolve o padrão', () => {
    expect(loadMediaSettings(store(null))).toEqual(DEFAULT_MEDIA_SETTINGS)
  })

  it('JSON quebrado devolve o padrão', () => {
    expect(loadMediaSettings(store('{oops'))).toEqual(DEFAULT_MEDIA_SETTINGS)
  })

  it('campo inválido cai no padrão só daquele campo', () => {
    const json = JSON.stringify({ audioInputId: 'mic1', audioOutputId: 42, noiseSuppression: 'sim', quality: 'ultra' })
    expect(loadMediaSettings(store(json))).toEqual(settings({ audioInputId: 'mic1' }))
  })

  it('lê valores válidos', () => {
    const s = settings({ audioInputId: 'a', audioOutputId: 'b', videoInputId: 'c', noiseSuppression: false, quality: 'alta' })
    expect(loadMediaSettings(store(JSON.stringify(s)))).toEqual(s)
  })
})

describe('saveMediaSettings', () => {
  it('grava como JSON na chave certa', () => {
    const saved: Record<string, string> = {}
    const s = settings({ quality: 'economia' })
    saveMediaSettings({ setItem: (k, v) => { saved[k] = v } }, s)
    expect(JSON.parse(saved[MEDIA_SETTINGS_KEY])).toEqual(s)
  })

  it('não quebra se o storage lançar erro', () => {
    expect(() => saveMediaSettings({ setItem: () => { throw new Error('cheio') } }, settings())).not.toThrow()
  })
})

describe('buildRoomOptions', () => {
  it('economia, normal e alta usam os bitrates de cada nível', () => {
    expect(buildRoomOptions(settings({ quality: 'economia' })).publishDefaults?.audioPreset?.maxBitrate).toBe(32_000)
    expect(buildRoomOptions(settings({ quality: 'normal' })).publishDefaults?.audioPreset?.maxBitrate).toBe(48_000)
    expect(buildRoomOptions(settings({ quality: 'alta' })).publishDefaults?.audioPreset?.maxBitrate).toBe(64_000)
    expect(buildRoomOptions(settings({ quality: 'economia' })).videoCaptureDefaults?.resolution).toMatchObject({ height: 360 })
    expect(buildRoomOptions(settings({ quality: 'normal' })).videoCaptureDefaults?.resolution).toMatchObject({ height: 720 })
    expect(buildRoomOptions(settings({ quality: 'alta' })).videoCaptureDefaults?.resolution).toMatchObject({ height: 1080 })
  })

  it('repassa a supressão de ruído e os aparelhos; null não vira string', () => {
    const o = buildRoomOptions(settings({ noiseSuppression: false, audioInputId: 'mic', audioOutputId: 'fone', videoInputId: 'cam' }))
    expect(o.audioCaptureDefaults).toMatchObject({ deviceId: 'mic', noiseSuppression: false })
    expect(o.audioOutput).toEqual({ deviceId: 'fone' })
    expect(o.videoCaptureDefaults?.deviceId).toBe('cam')

    const d = buildRoomOptions(DEFAULT_MEDIA_SETTINGS)
    expect(d.audioCaptureDefaults?.deviceId).toBeUndefined()
    expect(d.videoCaptureDefaults?.deviceId).toBeUndefined()
    expect(d.audioOutput).toBeUndefined()
  })
})

describe('buildScreenShareOptions', () => {
  it('alta captura e codifica a 60 fps', () => {
    const o = buildScreenShareOptions(settings({ quality: 'alta' }), true)
    expect(o.capture.resolution).toMatchObject({ height: 1080, frameRate: 60 })
    expect(o.publish.screenShareEncoding).toEqual({ maxBitrate: 8_000_000, maxFramerate: 60 })
  })

  it('repassa o áudio e não força 60 fps no normal', () => {
    expect(buildScreenShareOptions(settings(), true).capture.audio).toBe(true)
    expect(buildScreenShareOptions(settings(), false).capture.audio).toBe(false)
    expect(buildScreenShareOptions(settings(), false).capture.resolution.frameRate).not.toBe(60)
  })

  it('som da tela sai estéreo, sem DTX nem RED, com bitrate do nível', () => {
    expect(buildScreenShareOptions(settings(), true).publish).toMatchObject({ audioPreset: { maxBitrate: 96_000 }, dtx: false, red: false, forceStereo: true })
    expect(buildScreenAudioPublish(settings({ quality: 'economia' })).audioPreset.maxBitrate).toBe(64_000)
    expect(buildScreenAudioPublish(settings({ quality: 'alta' })).audioPreset.maxBitrate).toBe(128_000)
  })
})

describe('qualidade da tela (caixinha do compartilhamento)', () => {
  it('resume o que cada nível manda', () => {
    expect(screenQualitySummary('economia')).toBe('720p · 15 fps')
    expect(screenQualitySummary('normal')).toBe('1080p · 30 fps')
    expect(screenQualitySummary('alta')).toBe('1080p · 60 fps')
  })

  it('restrições da captura seguem o nível: tamanho como ideal e o fps do nível', () => {
    expect(screenVideoConstraints('economia')).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 15 })
    expect(screenVideoConstraints('normal')).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: 30 })
    expect(screenVideoConstraints('alta')).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: 60 })
  })

  it('a captura e a codificação usam o mesmo fps (sem capturar quadros que o codificador descarta)', () => {
    for (const quality of ['economia', 'normal', 'alta'] as const) {
      const { capture, publish } = buildScreenShareOptions(settings({ quality }), false)
      expect(capture.resolution.frameRate).toBe(publish.screenShareEncoding.maxFramerate)
    }
  })

  it('o áudio recebido passa pelo Web Audio (volume acima de 100%) e o vídeo não pausa com a janela escondida', () => {
    const o = buildRoomOptions(DEFAULT_MEDIA_SETTINGS)
    expect(o.webAudioMix).toBe(true)
    expect(o.adaptiveStream).toEqual({ pauseVideoInBackground: false })
  })
})
