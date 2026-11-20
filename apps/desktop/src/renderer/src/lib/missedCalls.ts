import { request, type User } from './api'

/** Ligação que não tocou porque o app estava fechado. Espelha MissedCallDto em server/api. */
export interface MissedCallDto {
  caller: User
  at: string
}

/** Chamadas perdidas agrupadas por quem ligou, da mais recente para a mais antiga. */
export interface MissedSummary {
  caller: User
  count: number
  lastAt: string
}

export const missedCallsApi = {
  list: (token: string) => request<MissedCallDto[]>('GET', '/calls/missed', { token }),
  clear: (token: string) => request<void>('DELETE', '/calls/missed', { token }),
}

export function summarizeMissed(calls: MissedCallDto[]): MissedSummary[] {
  const byCaller = new Map<string, MissedSummary>()
  for (const call of calls) {
    const found = byCaller.get(call.caller.id)
    if (!found) byCaller.set(call.caller.id, { caller: call.caller, count: 1, lastAt: call.at })
    else {
      found.count++
      if (Date.parse(call.at) > Date.parse(found.lastAt)) found.lastAt = call.at
    }
  }
  return [...byCaller.values()].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
}

const two = (n: number) => String(n).padStart(2, '0')

/** "às 10:32" se foi hoje, senão "em 19/11 às 10:32" (horário local). */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = `às ${two(d.getHours())}:${two(d.getMinutes())}`
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? time : `em ${two(d.getDate())}/${two(d.getMonth() + 1)} ${time}`
}

/** Ex.: "te ligou às 10:32" ou "te ligou 3 vezes, a última às 10:32". */
export function missedText(summary: MissedSummary, now: Date = new Date()): string {
  const when = formatWhen(summary.lastAt, now)
  return summary.count === 1 ? `te ligou ${when}` : `te ligou ${summary.count} vezes, a última ${when}`
}
