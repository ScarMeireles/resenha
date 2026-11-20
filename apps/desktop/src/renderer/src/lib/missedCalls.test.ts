import { describe, expect, it } from 'vitest'
import { formatWhen, missedText, summarizeMissed, type MissedCallDto } from './missedCalls'

const user = (id: string) => ({ id, username: id, displayName: id.toUpperCase(), avatarUrl: null, bannerUrl: null })
const call = (id: string, at: string): MissedCallDto => ({ caller: user(id), at })

describe('summarizeMissed', () => {
  it('agrupa por quem ligou e ordena pela mais recente', () => {
    const list = summarizeMissed([
      call('ana', '2026-11-20T10:00:00Z'),
      call('bia', '2026-11-20T11:00:00Z'),
      call('ana', '2026-11-20T12:00:00Z'),
    ])
    expect(list.map((s) => [s.caller.id, s.count, s.lastAt])).toEqual([
      ['ana', 2, '2026-11-20T12:00:00Z'],
      ['bia', 1, '2026-11-20T11:00:00Z'],
    ])
  })

  it('lista vazia fica vazia', () => {
    expect(summarizeMissed([])).toEqual([])
  })
})

describe('formatWhen e missedText', () => {
  const now = new Date(2026, 10, 20, 15, 0)

  it('hoje mostra só a hora', () => {
    expect(formatWhen(new Date(2026, 10, 20, 9, 5).toISOString(), now)).toBe('às 09:05')
  })

  it('outro dia mostra a data', () => {
    expect(formatWhen(new Date(2026, 10, 19, 22, 30).toISOString(), now)).toBe('em 19/11 às 22:30')
  })

  it('uma ligação e várias', () => {
    const at = new Date(2026, 10, 20, 10, 32).toISOString()
    expect(missedText({ caller: user('ana'), count: 1, lastAt: at }, now)).toBe('te ligou às 10:32')
    expect(missedText({ caller: user('ana'), count: 3, lastAt: at }, now)).toBe('te ligou 3 vezes, a última às 10:32')
  })
})
