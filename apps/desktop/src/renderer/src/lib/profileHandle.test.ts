import { describe, expect, it } from 'vitest'
import { canSaveHandle, handleStatus, needsAvailabilityCheck } from './profileHandle'

describe('handleStatus (campo do @ no cartão de perfil)', () => {
  it('o próprio @ atual não é "em uso": é o seu @', () => {
    // A API responde "em uso" para ele, mas aqui nem chega a perguntar.
    expect(handleStatus('gui', 'gui', { kind: 'taken' })).toEqual({ kind: 'current' })
    expect(handleStatus(' @Gui ', 'gui', { kind: 'idle' })).toEqual({ kind: 'current' })
    expect(needsAvailabilityCheck('@GUI', 'gui')).toBe(false)
  })

  it('regra local vem antes da consulta', () => {
    expect(handleStatus('ab', 'gui', { kind: 'idle' }).kind).toBe('invalid')
    expect(handleStatus('a-b-c', 'gui', { kind: 'available' }).kind).toBe('invalid')
    expect(needsAvailabilityCheck('ab', 'gui')).toBe(false)
  })

  it('enquanto a consulta não volta, mostra verificando', () => {
    expect(handleStatus('novo', 'gui', { kind: 'idle' })).toEqual({ kind: 'checking' })
    expect(needsAvailabilityCheck('novo', 'gui')).toBe(true)
  })

  it('repassa a resposta da API e só deixa salvar quando disponível', () => {
    expect(handleStatus('novo', 'gui', { kind: 'available' })).toEqual({ kind: 'available' })
    expect(handleStatus('bia', 'gui', { kind: 'taken' })).toEqual({ kind: 'taken' })
    expect(handleStatus('admin', 'gui', { kind: 'invalid', message: 'Reservado.' })).toEqual({ kind: 'invalid', message: 'Reservado.' })
    expect(canSaveHandle({ kind: 'available' })).toBe(true)
    expect(canSaveHandle({ kind: 'current' })).toBe(false)
    expect(canSaveHandle({ kind: 'taken' })).toBe(false)
    expect(canSaveHandle({ kind: 'checking' })).toBe(false)
  })
})
