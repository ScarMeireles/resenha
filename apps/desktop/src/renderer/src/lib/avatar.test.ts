import { describe, expect, it } from 'vitest'
import { colorFor, initialsOf } from './avatar'

describe('avatar sem foto', () => {
  it.each([
    ['Leo', 'LE'],
    ['Ana Souza', 'AS'],
    ['  maria da silva ', 'MS'],
    ['Ícaro', 'ÍC'],
    ['', '?'],
  ])('%s vira %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials)
  })

  it('a mesma pessoa tem sempre a mesma cor', () => {
    expect(colorFor('abc')).toEqual(colorFor('abc'))
  })
})
