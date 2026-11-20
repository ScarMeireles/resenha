import { describe, expect, it } from 'vitest'
import {
  appLabel, audioAppList, DEFAULT_SCREEN_AUDIO, loadScreenAudioPrefs, saveScreenAudioPrefs, SCREEN_AUDIO_KEY, toAudioChoice,
} from './screenAudioPrefs'

const store = (value: string | null) => ({ getItem: (k: string) => (k === SCREEN_AUDIO_KEY ? value : null) })

describe('loadScreenAudioPrefs', () => {
  it('sem nada salvo começa sem áudio e com o Resenha marcado', () => {
    expect(loadScreenAudioPrefs(store(null))).toEqual(DEFAULT_SCREEN_AUDIO)
    expect(DEFAULT_SCREEN_AUDIO).toEqual({ mode: 'none', resenha: true, exes: [] })
  })

  it('lê o que foi salvo e descarta lixo', () => {
    const saved = JSON.stringify({ mode: 'except', resenha: false, exes: ['discord.exe', 'C:\\x.exe', 3, '--a'] })
    expect(loadScreenAudioPrefs(store(saved))).toEqual({ mode: 'except', resenha: false, exes: ['discord.exe'] })
    expect(loadScreenAudioPrefs(store('{quebrado'))).toEqual(DEFAULT_SCREEN_AUDIO)
    expect(loadScreenAudioPrefs(store('{"mode":"tudo"}'))).toEqual(DEFAULT_SCREEN_AUDIO)
  })

  it('salvar e ler de volta dá o mesmo', () => {
    const data = new Map<string, string>()
    const prefs = { mode: 'all' as const, resenha: true, exes: ['spotify.exe'] }
    saveScreenAudioPrefs({ setItem: (k, v) => data.set(k, v) }, prefs)
    expect(loadScreenAudioPrefs({ getItem: (k) => data.get(k) ?? null })).toEqual(prefs)
  })
})

describe('toAudioChoice', () => {
  it('converte cada modo', () => {
    expect(toAudioChoice({ mode: 'none', resenha: true, exes: ['a.exe'] })).toEqual({ mode: 'none' })
    expect(toAudioChoice({ mode: 'all', resenha: true, exes: [] })).toEqual({ mode: 'all' })
    expect(toAudioChoice({ mode: 'except', resenha: true, exes: ['a.exe'] })).toEqual({ mode: 'except', resenha: true, exes: ['a.exe'] })
  })

  it('"menos" sem nada marcado vira todo o áudio', () => {
    expect(toAudioChoice({ mode: 'except', resenha: false, exes: [] })).toEqual({ mode: 'all' })
  })
})

describe('audioAppList', () => {
  it('junta os que tocam agora com os marcados antes, sem repetir, em ordem de nome', () => {
    expect(audioAppList(['steam.exe', 'discord.exe'], ['Discord.exe', 'spotify.exe'])).toEqual(['Discord.exe', 'spotify.exe', 'steam.exe'])
  })
})

describe('appLabel', () => {
  it('tira o .exe e põe a primeira letra maiúscula', () => {
    expect(appLabel('nvidia broadcast.exe')).toBe('Nvidia broadcast')
    expect(appLabel('Spotify.EXE')).toBe('Spotify')
  })
})
