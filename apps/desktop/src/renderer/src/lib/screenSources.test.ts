import { describe, expect, it } from 'vitest'
import { filterSources } from './screenSources'

const src = (id: string, kind: 'screen' | 'window') => ({ id, name: id, kind, thumbnail: '' })

describe('filterSources', () => {
  it('separa telas e janelas', () => {
    const all = [src('screen:1', 'screen'), src('window:2', 'window'), src('screen:3', 'screen')]
    expect(filterSources(all, 'screen').map((s) => s.id)).toEqual(['screen:1', 'screen:3'])
    expect(filterSources(all, 'window').map((s) => s.id)).toEqual(['window:2'])
  })
})
