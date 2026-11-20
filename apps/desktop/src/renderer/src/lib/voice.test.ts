import { describe, expect, it } from 'vitest'
import { formatDuration, micEnabled, toParticipantViews, type MicPrefs, type RawParticipant } from './voice'

const raw = (identity: string, extra: Partial<RawParticipant> = {}): RawParticipant => ({
  identity, isLocal: false, isSpeaking: false, isMicrophoneEnabled: true, ...extra,
})

describe('toParticipantViews', () => {
  it('põe você primeiro e ordena os outros pela identidade', () => {
    const views = toParticipantViews([raw('c'), raw('a'), raw('me', { isLocal: true }), raw('b')])
    expect(views.map((v) => v.id)).toEqual(['me', 'a', 'b', 'c'])
    expect(views[0].isLocal).toBe(true)
  })

  it('converte falando e microfone desligado', () => {
    const [a, b] = toParticipantViews([raw('a', { isSpeaking: true }), raw('b', { isMicrophoneEnabled: false })])
    expect(a).toMatchObject({ isSpeaking: true, isMuted: false })
    expect(b).toMatchObject({ isSpeaking: false, isMuted: true })
  })

  it('lista vazia continua vazia', () => {
    expect(toParticipantViews([])).toEqual([])
  })
})

describe('micEnabled (ensurdecer e desensurdecer)', () => {
  const prefs = (muted: boolean, deafened: boolean): MicPrefs => ({ muted, deafened })

  it('mic ligado só quando nem mutado nem ensurdecido', () => {
    expect(micEnabled(prefs(false, false))).toBe(true)
    expect(micEnabled(prefs(true, false))).toBe(false)
    expect(micEnabled(prefs(false, true))).toBe(false)
  })

  it('desensurdecer devolve o mic ao estado anterior', () => {
    // Estava com mic ligado: ensurdece (mic cai) e desensurdece (mic volta).
    expect(micEnabled(prefs(false, true))).toBe(false)
    expect(micEnabled(prefs(false, false))).toBe(true)
    // Estava mutado: ensurdece e desensurdece, continua mutado.
    expect(micEnabled(prefs(true, true))).toBe(false)
    expect(micEnabled(prefs(true, false))).toBe(false)
  })
})

describe('formatDuration', () => {
  it('formata hh:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00:00')
    expect(formatDuration(72)).toBe('00:01:12')
    expect(formatDuration(3725.9)).toBe('01:02:05')
  })

  it('não mostra negativo', () => {
    expect(formatDuration(-5)).toBe('00:00:00')
  })
})
