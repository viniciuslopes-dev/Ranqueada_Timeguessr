import type { GameMatch, Player, PlayerRanking, RankingMetric, RoundDetail, Score } from '../types'

// Partidas importadas trazem o numero oficial do TimeGuessr: ele define a cronologia
// competitiva mesmo quando um resultado antigo e lancado depois. Sem numero (placar
// digitado a mao), continua valendo a data e, em empate, a ordem de cadastro.
function compareMatchSequence(a: GameMatch, b: GameMatch, oldestFirst: boolean): number {
  const direction = oldestFirst ? 1 : -1
  if (typeof a.game_number === 'number' && typeof b.game_number === 'number' && a.game_number !== b.game_number) {
    return direction * (a.game_number - b.game_number)
  }
  const byDate = a.played_at.localeCompare(b.played_at)
  if (byDate) return direction * byDate
  const byCreation = a.created_at.localeCompare(b.created_at)
  if (byCreation) return direction * byCreation
  return direction * a.id.localeCompare(b.id)
}

export const compareMatchesNewest = (a: GameMatch, b: GameMatch) => compareMatchSequence(a, b, false)
export const compareMatchesOldest = (a: GameMatch, b: GameMatch) => compareMatchSequence(a, b, true)

export function buildRanking(
  players: Player[],
  matches: GameMatch[],
  scores: Score[],
  metric: RankingMetric = 'total',
): PlayerRanking[] {
  const orderedMatches = [...matches].sort(compareMatchesNewest)
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

export type PlayerConsistency = {
  player: Player
  games: number
  average: number
  best: number
  worst: number
  deviation: number
}

export type HeadToHead = {
  opponent: Player
  games: number
  wins: number
  losses: number
  draws: number
}

export type RoundAverage = {
  roundNumber: number
  average: number
  rounds: number
}

// desvio populacional: olhamos todas as partidas jogadas, nao uma amostra delas
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = average(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

// quem oscila menos aparece primeiro; com menos de duas partidas nao da para
// falar em regularidade, entao o jogador fica de fora
export function buildConsistency(players: Player[], scores: Score[]): PlayerConsistency[] {
  return players
    .map((player) => {
      const values = scores.filter((score) => score.player_id === player.id).map((score) => score.score)
      return {
        player,
        games: values.length,
        average: average(values),
        best: values.length ? Math.max(...values) : 0,
        worst: values.length ? Math.min(...values) : 0,
        deviation: standardDeviation(values),
      }
    })
    .filter((item) => item.games >= 2)
    .sort((a, b) => a.deviation - b.deviation || b.average - a.average)
}

// so contam as partidas em que os dois pontuaram: se um dos dois faltou, o
// confronto nao aconteceu
export function buildHeadToHead(playerId: string, players: Player[], scores: Score[]): HeadToHead[] {
  const own = new Map(scores.filter((score) => score.player_id === playerId).map((score) => [score.match_id, score.score]))
  return players
    .filter((player) => player.id !== playerId)
    .map((opponent) => {
      const record: HeadToHead = { opponent, games: 0, wins: 0, losses: 0, draws: 0 }
      for (const score of scores) {
        if (score.player_id !== opponent.id) continue
        const mine = own.get(score.match_id)
        if (mine === undefined) continue
        record.games += 1
        if (mine > score.score) record.wins += 1
        else if (mine < score.score) record.losses += 1
        else record.draws += 1
      }
      return record
    })
    .filter((record) => record.games > 0)
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
}

export function buildRoundAverages(rounds: RoundDetail[], playerId?: string): RoundAverage[] {
  const scoped = playerId ? rounds.filter((round) => round.player_id === playerId) : rounds
  return [1, 2, 3, 4, 5].map((roundNumber) => {
    const values = scoped.filter((round) => round.round_number === roundNumber).map((round) => round.round_score)
    return { roundNumber, average: average(values), rounds: values.length }
  })
}

// colocacao dentro de uma partida; empate divide a mesma posicao
export function getMatchPositions(matchId: string, scores: Score[]): Map<string, number> {
  const values = scores.filter((score) => score.match_id === matchId).sort((a, b) => b.score - a.score)
  const positions = new Map<string, number>()
  for (const score of values) {
    positions.set(score.player_id, values.findIndex((item) => item.score === score.score) + 1)
  }
  return positions
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
