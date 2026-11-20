import { describe, expect, it } from 'vitest'
import { CHOICE_TTL_MS, createChoiceStore, isValidChoice } from './screenChoice'

describe('createChoiceStore', () => {
  it('devolve a escolha uma única vez', () => {
    const store = createChoiceStore()
    store.set({ sourceId: 'screen:0:0', audio: true })
    expect(store.take()).toEqual({ sourceId: 'screen:0:0', audio: true })
    expect(store.take()).toBeNull()
  })

  it('devolve null sem escolha', () => {
    expect(createChoiceStore().take()).toBeNull()
  })

  it('expira depois do prazo e vale até o limite', () => {
    let t = 1000
    const store = createChoiceStore(() => t)
    store.set({ sourceId: 'a', audio: false })
    t += CHOICE_TTL_MS
    expect(store.take()).toEqual({ sourceId: 'a', audio: false })
    store.set({ sourceId: 'b', audio: false })
    t += CHOICE_TTL_MS + 1
    expect(store.take()).toBeNull()
  })

  it('uma nova escolha substitui a anterior', () => {
    const store = createChoiceStore()
    store.set({ sourceId: 'a', audio: false })
    store.set({ sourceId: 'b', audio: true })
    expect(store.take()?.sourceId).toBe('b')
  })
})

describe('isValidChoice', () => {
  it('aceita id e áudio válidos', () => {
    expect(isValidChoice({ sourceId: 'window:1:0', audio: false })).toBe(true)
  })

  it('rejeita o que não é válido', () => {
    expect(isValidChoice(null)).toBe(false)
    expect(isValidChoice('x')).toBe(false)
    expect(isValidChoice({ sourceId: '', audio: true })).toBe(false)
    expect(isValidChoice({ sourceId: 'x'.repeat(201), audio: true })).toBe(false)
    expect(isValidChoice({ sourceId: 1, audio: true })).toBe(false)
    expect(isValidChoice({ sourceId: 'a', audio: 'sim' })).toBe(false)
    expect(isValidChoice({ sourceId: 'a' })).toBe(false)
  })
})
