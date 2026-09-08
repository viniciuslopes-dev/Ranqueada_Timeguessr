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

// Modo liga: cada colocacao na partida vale uma pontuacao fixa (o formato que a
// turma usa no grupo) e o ranking e a soma dessas pontuacoes. Empate divide a
// mesma colocacao, entao dois primeiros levam 5 cada e o proximo ja cai para o
// terceiro lugar.
export const LEAGUE_POINTS = [5, 3, 1]

export function leaguePointsForPosition(position: number): number {
  return LEAGUE_POINTS[position - 1] ?? 0
}

// "1º 5 pts · 2º 3 pts · 3º 1 pt · 4º+ 0", montado da propria tabela
export const LEAGUE_RULE_LABEL = [
  ...LEAGUE_POINTS.map((points, index) => `${index + 1}º ${points} pt${points === 1 ? '' : 's'}`),
  `${LEAGUE_POINTS.length + 1}º+ 0`,
].join(' · ')

export const RANKING_METRICS: Array<{ key: RankingMetric; label: string; short: string; unit: string; hint: string }> = [
  { key: 'total', label: 'Pontos', short: 'pts', unit: 'pontos', hint: 'Soma dos placares do TimeGuessr' },
  { key: 'average', label: 'Média', short: 'pts', unit: 'por partida', hint: 'Média de pontos por partida' },
  { key: 'wins', label: 'Vitórias', short: 'vit.', unit: 'vitórias', hint: 'Quantas partidas cada um venceu' },
  { key: 'league', label: 'Liga', short: 'pts', unit: 'pts de liga', hint: LEAGUE_RULE_LABEL },
]

export function getRankingValue(player: PlayerRanking, metric: RankingMetric): number {
  if (metric === 'average') return player.average
  if (metric === 'wins') return player.wins
  if (metric === 'league') return player.leaguePoints
  return player.total
}

export function buildRanking(
  players: Player[],
  matches: GameMatch[],
  scores: Score[],
  metric: RankingMetric = 'total',
): PlayerRanking[] {
  const orderedMatches = [...matches].sort(compareMatchesNewest)
  const winningScores = new Map<string, number>()
  const positionsByMatch = new Map<string, Map<string, number>>()

  for (const match of matches) {
    const values = scores.filter((score) => score.match_id === match.id).map((score) => score.score)
    if (values.length) winningScores.set(match.id, Math.max(...values))
    positionsByMatch.set(match.id, getMatchPositions(match.id, scores))
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
    const placements = playerScores
      .map((score) => positionsByMatch.get(score.match_id)?.get(player.id))
      .filter((position): position is number => typeof position === 'number')

    return {
      ...player,
      total,
      average: games ? Math.round(total / games) : 0,
      wins: playerScores.filter((score) => score.score === winningScores.get(score.match_id)).length,
      seconds: placements.filter((position) => position === 2).length,
      thirds: placements.filter((position) => position === 3).length,
      leaguePoints: placements.reduce((sum, position) => sum + leaguePointsForPosition(position), 0),
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
    const primary = getRankingValue(b, metric) - getRankingValue(a, metric)
    // na liga, dois jogadores empatam em pontos com facilidade: o placar somado
    // desempata antes da media
    const leagueTiebreak = metric === 'league' ? b.total - a.total : 0
    return primary || b.wins - a.wins || leagueTiebreak || b.average - a.average || a.nickname.localeCompare(b.nickname)
  })
}

export type DailyStatus = {
  matches: GameMatch[]
  played: Array<{ player: Player; score: number }>
  missing: Player[]
}

// quem ja lancou o resultado de um dia e quem ainda falta. usa sempre o
// snapshot completo, nunca o recortado pelo filtro de periodo
export function getDailyStatus(players: Player[], matches: GameMatch[], scores: Score[], day: string): DailyStatus {
  const dayMatches = matches.filter((match) => match.played_at.slice(0, 10) === day)
  const ids = new Set(dayMatches.map((match) => match.id))
  const played: Array<{ player: Player; score: number }> = []
  const missing: Player[] = []

  for (const player of players) {
    const values = scores.filter((score) => ids.has(score.match_id) && score.player_id === player.id)
    if (values.length) played.push({ player, score: Math.max(...values.map((item) => item.score)) })
    else missing.push(player)
  }

  return { matches: dayMatches, played: played.sort((a, b) => b.score - a.score), missing }
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

export type MatchResult = {
  player: Player
  score: number
  position: number
  gap: number
}

export type RoundMetric = 'score' | 'year' | 'distance'

export type MatchRound = {
  roundNumber: number
  best: Record<RoundMetric, number | null>
  average: Record<RoundMetric, number>
  entries: Array<{ player: Player; detail: RoundDetail | null }>
}

export type MatchSummary = {
  results: MatchResult[]
  rounds: MatchRound[]
}

// nos pontos, maior e melhor; no erro de ano e na distancia, menor
export const ROUND_METRICS: Array<{ key: RoundMetric; label: string; unit: string; lowerIsBetter: boolean }> = [
  { key: 'score', label: 'Pontos', unit: 'pts', lowerIsBetter: false },
  { key: 'year', label: 'Ano', unit: 'anos', lowerIsBetter: true },
  { key: 'distance', label: 'Mapa', unit: 'km', lowerIsBetter: true },
]

export function getRoundValue(detail: RoundDetail | null, metric: RoundMetric): number | null {
  if (!detail) return null
  if (metric === 'score') return detail.round_score
  if (metric === 'year') return detail.year_error
  return detail.distance_km
}

// a rodada que mais castigou a turma na metrica escolhida
export function getHardestRound(rounds: MatchRound[], metric: RoundMetric): MatchRound | null {
  if (rounds.length < 2) return null
  const lowerIsBetter = ROUND_METRICS.find((item) => item.key === metric)!.lowerIsBetter
  return [...rounds].sort((a, b) => lowerIsBetter
    ? b.average[metric] - a.average[metric]
    : a.average[metric] - b.average[metric])[0]
}

// Resumo de uma unica partida: o resultado com a diferenca para o vencedor e,
// quando houver rodadas detalhadas, a leitura rodada a rodada de todos juntos.
export function buildMatchSummary(matchId: string, players: Player[], scores: Score[], rounds: RoundDetail[]): MatchSummary {
  const positions = getMatchPositions(matchId, scores)
  const ordered = scores.filter((score) => score.match_id === matchId).sort((a, b) => b.score - a.score)
  const top = ordered[0]?.score ?? 0

  const results = ordered
    .map((score) => {
      const player = players.find((item) => item.id === score.player_id)
      return player
        ? { player, score: score.score, position: positions.get(player.id) ?? 1, gap: score.score - top }
        : null
    })
    .filter((item): item is MatchResult => item !== null)

  const roster = results.map((result) => result.player)
  const matchRounds = rounds.filter((round) => round.match_id === matchId)

  const detailed: MatchRound[] = [1, 2, 3, 4, 5].map((roundNumber) => {
    const entries = roster.map((player) => ({
      player,
      detail: matchRounds.find((round) => round.round_number === roundNumber && round.player_id === player.id) ?? null,
    }))
    const best = {} as Record<RoundMetric, number | null>
    const mean = {} as Record<RoundMetric, number>
    for (const metric of ROUND_METRICS) {
      const values = entries
        .map((entry) => getRoundValue(entry.detail, metric.key))
        .filter((value): value is number => value !== null)
      best[metric.key] = values.length ? (metric.lowerIsBetter ? Math.min(...values) : Math.max(...values)) : null
      mean[metric.key] = average(values)
    }
    return { roundNumber, entries, best, average: mean }
  })

  // rodadas sem nenhum placar detalhado nao entram na grade
  return { results, rounds: detailed.filter((round) => round.entries.some((entry) => entry.detail)) }
}

// Rotulo curto de eixo. Sem isso, um acumulado de um ano vira "14.600.0k":
// acima de um milhao a unidade precisa mudar para M. As casas decimais saem do
// passo do eixo, para dois tiques vizinhos nunca virarem o mesmo texto.
export function formatCompact(value: number, step = 1): string {
  const unit = Math.abs(value) >= 1_000_000 ? 1_000_000 : Math.abs(value) >= 1000 ? 1000 : 1
  if (unit === 1) return formatScore(value)
  const stepInUnits = step / unit
  const digits = Number.isInteger(stepInUnits) ? 0 : Number.isInteger(stepInUnits * 10) ? 1 : 2
  const short = (value / unit).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${short}${unit === 1_000_000 ? 'M' : 'k'}`
}

export type Scale = { min: number; max: number; step: number }

// Escolhe um intervalo "redondo" que cubra os dados, para o eixo nao desperdicar
// area em faixas onde ninguem pontua. Sem isso, placares entre 31k e 48k ficam
// espremidos no terco superior de uma regua de 0 a 50k.
export function niceScale(min: number, max: number, ticks = 5): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 50000, step: 10000 }
  if (max === min) {
    const pad = Math.abs(max) > 1 ? Math.abs(max) * 0.1 : 1
    min -= pad
    max += pad
  }
  const rawStep = (max - min) / Math.max(1, ticks - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rawStep) ?? 10 * magnitude
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step }
}

export function buildScaleTicks(scale: Scale): number[] {
  const values: number[] = []
  // a tolerancia evita perder o ultimo tique por erro de ponto flutuante
  for (let value = scale.min; value <= scale.max + scale.step / 1000; value += scale.step) {
    values.push(Number(value.toFixed(6)))
  }
  return values
}

export type PlayerStreak = {
  player: Player
  current: number
  longest: number
  games: number
}

export type MonthlyChampion = {
  month: string
  matches: number
  champion: PlayerRanking | null
}

// So as partidas em que o jogador pontuou contam: faltar um dia nao zera a
// sequencia, apenas nao a aumenta. Empate no topo conta como vitoria, igual ao
// resto do app.
export function buildStreaks(players: Player[], matches: GameMatch[], scores: Score[]): PlayerStreak[] {
  const ordered = [...matches].sort(compareMatchesOldest)
  const winners = new Map(ordered.map((match) => [match.id, getWinnerIds(match.id, scores)]))

  return players
    .map((player) => {
      let current = 0
      let longest = 0
      let games = 0
      for (const match of ordered) {
        if (!scores.some((score) => score.match_id === match.id && score.player_id === player.id)) continue
        games += 1
        if (winners.get(match.id)?.includes(player.id)) {
          current += 1
          longest = Math.max(longest, current)
        } else {
          current = 0
        }
      }
      return { player, current, longest, games }
    })
    .filter((item) => item.games > 0)
    .sort((a, b) => b.current - a.current || b.longest - a.longest || a.player.nickname.localeCompare(b.player.nickname))
}

// campeao de cada mes, do mais recente para o mais antigo. O titulo mensal sai
// da pontuacao por colocacao: no mes, subir ao podio com regularidade vale mais
// do que um placar alto isolado.
export function buildMonthlyChampions(players: Player[], matches: GameMatch[], scores: Score[], metric: RankingMetric = 'league'): MonthlyChampion[] {
  const months = new Map<string, GameMatch[]>()
  for (const match of matches) {
    const month = match.played_at.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), match])
  }

  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, monthMatches]) => {
      const ids = new Set(monthMatches.map((match) => match.id))
      const ranking = buildRanking(players, monthMatches, scores.filter((score) => ids.has(score.match_id)), metric)
        .filter((player) => player.games > 0)
      return { month, matches: monthMatches.length, champion: ranking[0] ?? null }
    })
}

// os extremos do confronto direto: quem mais te venceu e quem voce mais venceu
export function getRivalries(duels: HeadToHead[]): { nemesis: HeadToHead | null; favourite: HeadToHead | null } {
  const balance = (duel: HeadToHead) => duel.wins - duel.losses
  const sorted = [...duels].sort((a, b) => balance(a) - balance(b) || b.games - a.games)
  const nemesis = sorted[0]
  const favourite = sorted[sorted.length - 1]
  return {
    nemesis: nemesis && balance(nemesis) < 0 ? nemesis : null,
    favourite: favourite && balance(favourite) > 0 ? favourite : null,
  }
}

export function formatMonthLabel(month: string): string {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const MEDALS = ['🥇', '🥈', '🥉']

// texto pronto para colar de volta no grupo do WhatsApp
export function buildRankingShareText(roomName: string, periodLabel: string, ranking: PlayerRanking[], matchCount: number, metric: RankingMetric = 'total'): string {
  const descriptor = RANKING_METRICS.find((item) => item.key === metric) ?? RANKING_METRICS[0]
  const lines = ranking
    .filter((player) => player.games > 0)
    .map((player, index) => `${MEDALS[index] ?? `${index + 1}.`} ${player.nickname} — ${formatScore(getRankingValue(player, metric))} ${descriptor.short} · ${player.wins} vitória${player.wins === 1 ? '' : 's'}`)

  return [
    `🏆 CronoRank — ${roomName}`,
    `${periodLabel} · ${matchCount} partida${matchCount === 1 ? '' : 's'}`,
    ...(metric === 'league' ? [`Pontuação por colocação: ${LEAGUE_RULE_LABEL}`] : []),
    '',
    ...(lines.length ? lines : ['Ninguém pontuou ainda.']),
  ].join('\n')
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
