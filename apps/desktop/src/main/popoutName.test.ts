import { describe, expect, it } from 'vitest'
import { isPopoutName, popoutName } from './popoutName'

describe('nome da janela separada', () => {
  it('só aceita o nome que o app gera', () => {
    expect(isPopoutName(popoutName(1))).toBe(true)
    expect(isPopoutName(popoutName(42))).toBe(true)
    expect(isPopoutName('resenha-transmissao')).toBe(false)
    expect(isPopoutName('resenha-transmissao-1x')).toBe(false)
    expect(isPopoutName('_blank')).toBe(false)
    expect(isPopoutName('')).toBe(false)
  })
})
