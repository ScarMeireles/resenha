import { describe, expect, it } from 'vitest'
import { CHOICE_TTL_MS, createChoiceStore, isValidAudioChoice, isValidChoice, isValidExe, MAX_EXCLUDED_APPS } from './screenChoice'

const none = { mode: 'none' } as const
const all = { mode: 'all' } as const

describe('createChoiceStore', () => {
  it('devolve a escolha uma única vez', () => {
    const store = createChoiceStore()
    store.set({ sourceId: 'screen:0:0', audio: all })
    expect(store.take()).toEqual({ sourceId: 'screen:0:0', audio: all })
    expect(store.take()).toBeNull()
  })

  it('devolve null sem escolha', () => {
    expect(createChoiceStore().take()).toBeNull()
  })

  it('expira depois do prazo e vale até o limite', () => {
    let t = 1000
    const store = createChoiceStore(() => t)
    store.set({ sourceId: 'a', audio: none })
    t += CHOICE_TTL_MS
    expect(store.take()).toEqual({ sourceId: 'a', audio: none })
    store.set({ sourceId: 'b', audio: none })
    t += CHOICE_TTL_MS + 1
    expect(store.take()).toBeNull()
  })

  it('uma nova escolha substitui a anterior', () => {
    const store = createChoiceStore()
    store.set({ sourceId: 'a', audio: none })
    store.set({ sourceId: 'b', audio: all })
    expect(store.take()?.sourceId).toBe('b')
  })
})

describe('isValidChoice', () => {
  it('aceita id e áudio válidos', () => {
    expect(isValidChoice({ sourceId: 'window:1:0', audio: none })).toBe(true)
    expect(isValidChoice({ sourceId: 'screen:0:0', audio: { mode: 'except', resenha: true, exes: ['discord.exe'] } })).toBe(true)
  })

  it('rejeita o que não é válido', () => {
    expect(isValidChoice(null)).toBe(false)
    expect(isValidChoice('x')).toBe(false)
    expect(isValidChoice({ sourceId: '', audio: all })).toBe(false)
    expect(isValidChoice({ sourceId: 'x'.repeat(201), audio: all })).toBe(false)
    expect(isValidChoice({ sourceId: 1, audio: all })).toBe(false)
    expect(isValidChoice({ sourceId: 'a', audio: true })).toBe(false)
    expect(isValidChoice({ sourceId: 'a' })).toBe(false)
  })
})

describe('isValidAudioChoice', () => {
  it('aceita "menos" com o Resenha, com apps ou com os dois', () => {
    expect(isValidAudioChoice({ mode: 'except', resenha: true, exes: [] })).toBe(true)
    expect(isValidAudioChoice({ mode: 'except', resenha: false, exes: ['Spotify.exe'] })).toBe(true)
  })

  it('rejeita "menos" que não tira nada, modo desconhecido e lista grande demais', () => {
    expect(isValidAudioChoice({ mode: 'except', resenha: false, exes: [] })).toBe(false)
    expect(isValidAudioChoice({ mode: 'tudo' })).toBe(false)
    expect(isValidAudioChoice({ mode: 'except', resenha: true })).toBe(false)
    const many = Array.from({ length: MAX_EXCLUDED_APPS + 1 }, (_, i) => `app${i}.exe`)
    expect(isValidAudioChoice({ mode: 'except', resenha: true, exes: many })).toBe(false)
  })
})

describe('isValidExe', () => {
  it('aceita nomes de executável comuns', () => {
    for (const exe of ['discord.exe', 'NVIDIA Broadcast.exe', 'Spotify.exe', 'game (x64).exe']) expect(isValidExe(exe)).toBe(true)
  })

  it('rejeita caminho, argumento e o que não é .exe', () => {
    for (const exe of ['C:\\x\\a.exe', '../a.exe', '--exclude-pid', '-a.exe', 'a.bat', '', 'a.exe"']) expect(isValidExe(exe)).toBe(false)
  })
})
