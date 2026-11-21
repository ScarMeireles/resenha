import { describe, expect, it } from 'vitest'
import type { User } from './api'
import { replaceUser } from './users'

const user = (id: string, displayName = id): User => ({ id, username: id, displayName, avatarUrl: null, bannerUrl: null })

describe('replaceUser', () => {
  it('troca só a pessoa certa e mantém os outros campos do item', () => {
    const list = [{ user: user('a'), presence: 'online' }, { user: user('b'), presence: 'away' }]
    const next = replaceUser(list, user('b', 'Bia'))
    expect(next[1]).toEqual({ user: user('b', 'Bia'), presence: 'away' })
    expect(next[0]).toBe(list[0])
  })

  it('devolve a mesma lista se a pessoa não está nela', () => {
    const list = [{ user: user('a') }]
    expect(replaceUser(list, user('z'))).toBe(list)
  })
})
