/** Bytes de um quadro de áudio do ajudante: 2 canais × float de 4 bytes. */
export const FRAME_BYTES = 8

/**
 * O stdout do ajudante chega em pedaços de tamanho qualquer, e um float pode ficar cortado entre dois pedaços.
 * Isto devolve só quadros inteiros e guarda a sobra para o próximo pedaço.
 */
export function createFrameAligner(frameBytes = FRAME_BYTES) {
  let pending: Buffer = Buffer.alloc(0)
  return (chunk: Buffer): Buffer | null => {
    const data = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk
    const whole = data.length - (data.length % frameBytes)
    pending = Buffer.from(data.subarray(whole))
    return whole > 0 ? data.subarray(0, whole) : null
  }
}

/** Argumentos do comando `capture` do ajudante. */
export function captureArgs(resenhaPid: number | null, exes: readonly string[]): string[] {
  const args = ['capture']
  if (resenhaPid != null) args.push('--exclude-pid', String(resenhaPid))
  for (const exe of exes) args.push('--exclude-exe', exe)
  return args
}
