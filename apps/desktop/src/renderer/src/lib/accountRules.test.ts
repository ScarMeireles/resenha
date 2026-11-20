import { describe, expect, it } from 'vitest'
import { normalizeUsername, validateDisplayName, validateImage, validatePassword, validateUsername } from './accountRules'

describe('regras de conta (iguais às da API)', () => {
  it('normaliza o @ como o servidor', () => {
    expect(normalizeUsername('  @Leo.22 ')).toBe('leo.22')
  })

  it.each(['leo', 'ana_souza', '@Bruno.22', 'a'.repeat(20)])('aceita o @ %s', (u) => {
    expect(validateUsername(u)).toBeNull()
  })

  it.each(['ab', 'a'.repeat(21), 'ana-souza', 'joão', 'a b'])('recusa o @ %s', (u) => {
    expect(validateUsername(u)).not.toBeNull()
  })

  it('exige nome e limita o tamanho', () => {
    expect(validateDisplayName('   ')).toBe('Informe um nome.')
    expect(validateDisplayName('x'.repeat(33))).not.toBeNull()
    expect(validateDisplayName(' Leo ')).toBeNull()
  })

  it('senha válida passa sem erros', () => {
    expect(validatePassword('Senha!1')).toEqual([])
  })

  it('senha fraca lista tudo o que falta', () => {
    expect(validatePassword('abc')).toHaveLength(3) // tamanho, maiúscula e especial
    expect(validatePassword('Senha com espaço')).toHaveLength(2) // tamanho e especial (espaço não conta)
  })

  it('aceita só imagens de até 10 MB nos formatos da API', () => {
    const file = (type: string, size: number) => new File([new Uint8Array(size)], 'x', { type })
    expect(validateImage(file('image/png', 1000))).toBeNull()
    expect(validateImage(file('image/svg+xml', 1000))).not.toBeNull()
    expect(validateImage(file('image/gif', 10 * 1024 * 1024 + 1))).not.toBeNull()
  })
})
