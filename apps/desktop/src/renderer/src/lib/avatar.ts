/** Cores de avatar dos mockups. Texto escuro só no laranja, que é claro demais para texto branco. */
const palette = [
  { bg: '#7C5CFF', fg: '#ECEEF1' },
  { bg: '#2F8F83', fg: '#ECEEF1' },
  { bg: '#C2417A', fg: '#ECEEF1' },
  { bg: '#B4561E', fg: '#ECEEF1' },
  { bg: '#FF8A3D', fg: '#1A1206' },
  { bg: '#3B6FD4', fg: '#ECEEF1' },
]

/** "Ana Souza" → "AS"; "Leo" → "LE". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[words.length - 1]][0]]
  return letters.join('').toLocaleUpperCase('pt-BR')
}

/** Sempre a mesma cor para o mesmo id. */
export function colorFor(seed: string): { bg: string; fg: string } {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return palette[Math.abs(hash) % palette.length]
}
