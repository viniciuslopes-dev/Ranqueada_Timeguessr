import type { RoomSnapshot } from '../types'
import { formatShortDate } from './ranking'

export type PeriodPreset = 'all' | 'today' | 'week' | 'month' | 'custom'
export type Period =
  | { preset: 'all' | 'today' | 'week' | 'month' }
  | { preset: 'custom'; from: string; to: string }
export type DateRange = { from: string; to: string } | null

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// As datas das partidas sao dias civis ("2026-09-03"), entao todo o calculo usa o
// fuso local. toISOString() daria o dia em UTC e adiantaria a data em um dia a
// partir das 21h no Brasil.
export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const localToday = () => toDateKey(new Date())

export const localDaysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toDateKey(date)
}

const fromDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const shift = (date: Date, days: number) => {
  const moved = new Date(date)
  moved.setDate(date.getDate() + days)
  return moved
}

export function resolvePeriod(period: Period, today = localToday()): DateRange {
  if (period.preset === 'all') return null

  if (period.preset === 'custom') {
    if (!DATE_PATTERN.test(period.from) || !DATE_PATTERN.test(period.to)) return null
    // aceita o intervalo invertido em vez de nao mostrar nada
    return period.from <= period.to
      ? { from: period.from, to: period.to }
      : { from: period.to, to: period.from }
  }

  if (period.preset === 'today') return { from: today, to: today }

  const reference = fromDateKey(today)
  if (period.preset === 'week') {
    // a semana da liga vai de segunda a domingo
    const weekday = (reference.getDay() + 6) % 7
    const monday = shift(reference, -weekday)
    return { from: toDateKey(monday), to: toDateKey(shift(monday, 6)) }
  }

  const first = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const last = new Date(reference.getFullYear(), reference.getMonth() + 1, 0)
  return { from: toDateKey(first), to: toDateKey(last) }
}

export function isWithinRange(playedAt: string, range: DateRange): boolean {
  if (!range) return true
  const day = playedAt.slice(0, 10)
  return day >= range.from && day <= range.to
}

// Recorta o snapshot no periodo: as partidas saem primeiro e placares e rodadas
// acompanham, senao o ranking somaria pontos de partidas que nao estao mais na lista.
export function filterSnapshotByPeriod(snapshot: RoomSnapshot, range: DateRange): RoomSnapshot {
  if (!range) return snapshot
  const matches = snapshot.matches.filter((match) => isWithinRange(match.played_at, range))
  const ids = new Set(matches.map((match) => match.id))
  return {
    ...snapshot,
    matches,
    scores: snapshot.scores.filter((score) => ids.has(score.match_id)),
    rounds: (snapshot.rounds ?? []).filter((round) => ids.has(round.match_id)),
  }
}

export function formatPeriodLabel(range: DateRange): string {
  if (!range) return 'Todas as partidas'
  if (range.from === range.to) return formatShortDate(range.from)
  return `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`
}
