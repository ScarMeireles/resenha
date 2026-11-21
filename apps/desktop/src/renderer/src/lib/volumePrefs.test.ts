import { describe, expect, it } from 'vitest'
import {
  clampVolume, DEFAULT_PERSON_AUDIO, effectiveVolume, fromPercent, loadVolumes, MAX_PEOPLE, personAudio, saveVolumes, toPercent,
  updatePerson, VOLUMES_KEY, type VolumeMap,
} from './volumePrefs'

const storage = (text: string | null) => ({ getItem: () => text })

describe('clampVolume', () => {
  it('limita entre 0 e 2 (200%)', () => {
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(2.5)).toBe(2)
    expect(clampVolume(1.234)).toBe(1.23)
  })
  it('valor inválido vira 100%', () => {
    expect(clampVolume(Number.NaN)).toBe(1)
    expect(clampVolume(Infinity)).toBe(1)
    expect(clampVolume('2')).toBe(1)
  })
  it('converte de e para porcentagem', () => {
    expect(toPercent(1.5)).toBe(150)
    expect(fromPercent(200)).toBe(2)
    expect(fromPercent(350)).toBe(2)
  })
})

describe('loadVolumes', () => {
  it('vazio, JSON quebrado ou formato errado devolvem mapa vazio', () => {
    expect(loadVolumes(storage(null))).toEqual({})
    expect(loadVolumes(storage('{'))).toEqual({})
    expect(loadVolumes(storage('[1,2]'))).toEqual({})
  })
  it('lê por pessoa, corrige valores e descarta id inválido e quem está no padrão', () => {
    const map = loadVolumes(storage(JSON.stringify({
      ana: { voice: { volume: 1.5, muted: false }, screen: { volume: 9, muted: true } },
      'id com espaço': { voice: { volume: 0.5 } },
      bia: { voice: { volume: 1 }, screen: {} },
    })))
    expect(map).toEqual({ ana: { voice: { volume: 1.5, muted: false }, screen: { volume: 2, muted: true } } })
  })
  it('salva e lê de volta', () => {
    let saved = ''
    const map = updatePerson({}, 'ana', 'voice', { volume: 0.4 })
    saveVolumes({ setItem: (k, v) => { expect(k).toBe(VOLUMES_KEY); saved = v } }, map)
    expect(loadVolumes(storage(saved))).toEqual(map)
  })
  it('não quebra se o storage lançar erro', () => {
    expect(() => saveVolumes({ setItem: () => { throw new Error('cheio') } }, {})).not.toThrow()
  })
})

describe('updatePerson', () => {
  it('guarda voz e tela separados, por pessoa', () => {
    let map: VolumeMap = {}
    map = updatePerson(map, 'ana', 'voice', { volume: 1.8 })
    map = updatePerson(map, 'ana', 'screen', { volume: 0.5 })
    map = updatePerson(map, 'bia', 'voice', { muted: true })
    expect(personAudio(map, 'ana')).toEqual({ voice: { volume: 1.8, muted: false }, screen: { volume: 0.5, muted: false } })
    expect(personAudio(map, 'bia').voice).toEqual({ volume: 1, muted: true })
    expect(personAudio(map, 'caio')).toBe(DEFAULT_PERSON_AUDIO)
  })
  it('limita o volume em 200%', () => {
    expect(personAudio(updatePerson({}, 'ana', 'voice', { volume: 5 }), 'ana').voice.volume).toBe(2)
  })
  it('quem volta ao padrão sai do mapa', () => {
    const map = updatePerson(updatePerson({}, 'ana', 'voice', { volume: 0.5 }), 'ana', 'voice', { volume: 1 })
    expect(map).toEqual({})
  })
  it('desmutar com volume em 0% volta para 100%', () => {
    let map = updatePerson({}, 'ana', 'screen', { volume: 0, muted: true })
    map = updatePerson(map, 'ana', 'screen', { muted: false })
    expect(map).toEqual({})
  })
  it('id inválido não muda nada', () => {
    const map = {}
    expect(updatePerson(map, '../x', 'voice', { volume: 2 })).toBe(map)
  })
  it('passando do teto, esquece quem foi mexido há mais tempo', () => {
    let map: VolumeMap = {}
    for (let i = 0; i <= MAX_PEOPLE; i++) map = updatePerson(map, `p${i}`, 'voice', { volume: 0.5 })
    expect(Object.keys(map)).toHaveLength(MAX_PEOPLE)
    expect(map.p0).toBeUndefined()
    expect(map[`p${MAX_PEOPLE}`]).toBeDefined()
  })
})

describe('effectiveVolume', () => {
  const map = updatePerson(updatePerson({}, 'ana', 'voice', { volume: 1.5 }), 'ana', 'screen', { volume: 0.8, muted: true })
  it('usa o volume da pessoa', () => {
    expect(effectiveVolume(map, 'ana', 'voice', false)).toBe(1.5)
    expect(effectiveVolume(map, 'bia', 'voice', false)).toBe(1)
  })
  it('silenciado para mim ou ensurdecido = 0', () => {
    expect(effectiveVolume(map, 'ana', 'screen', false)).toBe(0)
    expect(effectiveVolume(map, 'ana', 'voice', true)).toBe(0)
  })
})
