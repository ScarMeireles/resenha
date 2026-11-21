/**
 * Volume de cada pessoa, só para você e só neste PC (localStorage): a voz e o som da transmissão de tela
 * ficam separados. 1 = 100% (como chega); até 2 = 200%, com ganho no Web Audio (ver lib/voice.ts).
 */

export type AudioKind = 'voice' | 'screen'

export interface PersonVolume {
  /** 0 a 2 (0% a 200%). */
  volume: number
  /** "Silenciar para mim": guarda o volume para voltar a ele ao desmutar. */
  muted: boolean
}

export type PersonAudio = Readonly<Record<AudioKind, PersonVolume>>

/** Volumes por id de usuário. Quem não está aqui usa o padrão (100%, sem mudo). */
export type VolumeMap = Readonly<Record<string, PersonAudio>>

export const VOLUME_MAX = 2
export const VOLUMES_KEY = 'resenha.volumes'
/** Teto de pessoas guardadas, para o storage não crescer sem limite. */
export const MAX_PEOPLE = 300

const DEFAULT_VOLUME: PersonVolume = { volume: 1, muted: false }
export const DEFAULT_PERSON_AUDIO: PersonAudio = { voice: DEFAULT_VOLUME, screen: DEFAULT_VOLUME }

const ID = /^[\w-]{1,64}$/

/** Valor inválido vira 100%; fora da faixa vai para 0 ou 200%. Arredonda em 1%. */
export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.round(Math.min(VOLUME_MAX, Math.max(0, value)) * 100) / 100
}

export const toPercent = (volume: number): number => Math.round(clampVolume(volume) * 100)
export const fromPercent = (percent: number): number => clampVolume(percent / 100)

const isDefault = (v: PersonVolume) => v.volume === 1 && !v.muted

function readVolume(raw: unknown): PersonVolume {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_VOLUME
  const o = raw as Record<string, unknown>
  return { volume: clampVolume(o.volume ?? 1), muted: o.muted === true }
}

export function loadVolumes(storage: Pick<Storage, 'getItem'>): VolumeMap {
  let raw: unknown
  try {
    raw = JSON.parse(storage.getItem(VOLUMES_KEY) ?? 'null')
  } catch {
    return {}
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const map: Record<string, PersonAudio> = {}
  for (const [id, value] of Object.entries(raw).slice(0, MAX_PEOPLE)) {
    if (!ID.test(id) || typeof value !== 'object' || value === null) continue
    const o = value as Record<string, unknown>
    const person = { voice: readVolume(o.voice), screen: readVolume(o.screen) }
    if (!isDefault(person.voice) || !isDefault(person.screen)) map[id] = person
  }
  return map
}

export function saveVolumes(storage: Pick<Storage, 'setItem'>, map: VolumeMap): void {
  try {
    storage.setItem(VOLUMES_KEY, JSON.stringify(map))
  } catch {
    // Sem storage: o volume vale só nesta sessão.
  }
}

export function personAudio(map: VolumeMap, id: string): PersonAudio {
  return map[id] ?? DEFAULT_PERSON_AUDIO
}

/**
 * Muda o volume ou o mudo de uma pessoa e devolve um mapa novo. Quem volta ao padrão sai do mapa.
 * Desmutar com o volume em 0% volta para 100%, senão "desmutar" não mudaria nada.
 */
export function updatePerson(map: VolumeMap, id: string, kind: AudioKind, patch: Partial<PersonVolume>): VolumeMap {
  if (!ID.test(id)) return map
  const before = personAudio(map, id)
  let next: PersonVolume = {
    volume: patch.volume === undefined ? before[kind].volume : clampVolume(patch.volume),
    muted: patch.muted ?? before[kind].muted,
  }
  if (patch.muted === false && patch.volume === undefined && next.volume === 0) next = { ...next, volume: 1 }
  const person: PersonAudio = { ...before, [kind]: next }
  const { [id]: _removed, ...rest } = map
  if (isDefault(person.voice) && isDefault(person.screen)) return rest
  const ids = Object.keys(rest)
  // Passou do teto: esquece quem foi mexido há mais tempo (a ordem de inserção do objeto).
  const kept = ids.length >= MAX_PEOPLE ? Object.fromEntries(ids.slice(ids.length - MAX_PEOPLE + 1).map((k) => [k, rest[k]])) : rest
  return { ...kept, [id]: person }
}

/** Volume que vai para o LiveKit: 0 se ensurdecido ou silenciado para você. */
export function effectiveVolume(map: VolumeMap, id: string, kind: AudioKind, deafened: boolean): number {
  const v = personAudio(map, id)[kind]
  return deafened || v.muted ? 0 : v.volume
}
