import type { GameMatch, Player, PlayerRanking, RankingMetric, Score } from '../types'

const byNewest = (a: GameMatch, b: GameMatch) =>
  new Date(b.played_at).getTime() - new Date(a.played_at).getTime()

export function buildRanking(
  players: Player[],
  matches: GameMatch[],
  scores: Score[],
  metric: RankingMetric = 'total',
): PlayerRanking[] {
  const orderedMatches = [...matches].sort(byNewest)
  const winningScores = new Map<string, number>()

  for (const match of matches) {
    const values = scores.filter((score) => score.match_id === match.id).map((score) => score.score)
    if (values.length) winningScores.set(match.id, Math.max(...values))
  }

  const ranking = players.map((player) => {
    const playerScores = scores.filter((score) => score.player_id === player.id)
    const total = playerScores.reduce((sum, item) => sum + item.score, 0)
    const games = playerScores.length
    const recentScores = orderedMatches
      .map((match) => playerScores.find((score) => score.match_id === match.id)?.score)
      .filter((score): score is number => typeof score === 'number')
    const recentAverage = average(recentScores.slice(0, 3))
    const previousAverage = average(recentScores.slice(3, 6))

    return {
      ...player,
      total,
      average: games ? Math.round(total / games) : 0,
      wins: playerScores.filter((score) => score.score === winningScores.get(score.match_id)).length,
      games,
      best: games ? Math.max(...playerScores.map((item) => item.score)) : 0,
      trend: previousAverage ? Math.round(recentAverage - previousAverage) : 0,
      form: orderedMatches.slice(0, 5).map((match) => {
        const value = playerScores.find((score) => score.match_id === match.id)?.score
        if (typeof value !== 'number') return 'missed'
        return value === winningScores.get(match.id) ? 'win' : 'played'
      }),
    }
  })

  return ranking.sort((a, b) => {
    const primary = metric === 'total' ? b.total - a.total : metric === 'average' ? b.average - a.average : b.wins - a.wins
    return primary || b.wins - a.wins || b.average - a.average || a.nickname.localeCompare(b.nickname)
  })
}

export function getWinnerIds(matchId: string, scores: Score[]): string[] {
  const matchScores = scores.filter((score) => score.match_id === matchId)
  if (!matchScores.length) return []
  const highest = Math.max(...matchScores.map((score) => score.score))
  return matchScores.filter((score) => score.score === highest).map((score) => score.player_id)
}

export function formatScore(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.round(value))
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    .replace('.', '')
}

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}
