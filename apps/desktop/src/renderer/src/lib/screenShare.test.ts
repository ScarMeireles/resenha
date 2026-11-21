import { describe, expect, it } from 'vitest'
import { formatWatchers, sameAudioChoice, screenAudioLabel } from './screenShare'

describe('formatWatchers', () => {
  it('fala de quem pode ver, em português', () => {
    expect(formatWatchers([])).toBe('Ninguém mais na chamada ainda')
    expect(formatWatchers(['Duda'])).toBe('Duda pode ver')
    expect(formatWatchers(['Duda', 'Léo'])).toBe('Duda e Léo podem ver')
    expect(formatWatchers(['Duda', 'Léo', 'Caio'])).toBe('Duda, Léo e Caio podem ver')
    expect(formatWatchers(['A', 'B', 'C', 'D', 'E'])).toBe('A, B e mais 3 podem ver')
  })
})

describe('screenAudioLabel', () => {
  it('descreve cada modo', () => {
    expect(screenAudioLabel({ mode: 'all' })).toBe('Todo o áudio do PC')
    expect(screenAudioLabel({ mode: 'none' })).toMatch(/^Sem áudio/)
    expect(screenAudioLabel({ mode: 'except', resenha: true, exes: [] })).toBe('Todo o áudio, menos o Resenha')
    expect(screenAudioLabel({ mode: 'except', resenha: true, exes: ['discord.exe'] })).toBe('Todo o áudio, menos o Resenha e Discord')
    expect(screenAudioLabel({ mode: 'except', resenha: false, exes: ['a.exe', 'b.exe', 'c.exe', 'd.exe'] })).toBe('Todo o áudio, menos A, B e mais 2')
  })
})

describe('sameAudioChoice', () => {
  it('compara modo e, no "menos", a lista sem ligar para ordem ou maiúsculas', () => {
    expect(sameAudioChoice({ mode: 'all' }, { mode: 'all' })).toBe(true)
    expect(sameAudioChoice({ mode: 'all' }, { mode: 'none' })).toBe(false)
    expect(sameAudioChoice(
      { mode: 'except', resenha: true, exes: ['A.exe', 'b.exe'] },
      { mode: 'except', resenha: true, exes: ['b.exe', 'a.exe'] },
    )).toBe(true)
    expect(sameAudioChoice(
      { mode: 'except', resenha: true, exes: ['a.exe'] },
      { mode: 'except', resenha: false, exes: ['a.exe'] },
    )).toBe(false)
  })
})
