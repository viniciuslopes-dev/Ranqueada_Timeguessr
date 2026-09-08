import { describe, expect, it } from 'vitest'
import { LEAGUE_RULE_LABEL, getRankingValue, leaguePointsForPosition, buildMatchSummary, buildScaleTicks, formatCompact, getHardestRound, niceScale, buildMonthlyChampions, buildRankingShareText, buildStreaks, formatMonthLabel, getRivalries, buildHeadToHead, buildRanking, buildRoundAverages, getDailyStatus, compareMatchesNewest, compareMatchesOldest, formatScore, getMatchPositions, getWinnerIds } from './ranking'
import type { GameMatch, Player, RoundDetail, Score } from '../types'

const players: Player[] = [
  { id: 'a', room_id: 'r', nickname: 'Ana', color: '#ff7043', created_at: '' },
  { id: 'b', room_id: 'r', nickname: 'Beto', color: '#4f7cff', created_at: '' },
]
const matches: GameMatch[] = [
  { id: 'm1', room_id: 'r', title: 'Um', game_number: null, played_at: '2026-01-01', created_at: '' },
  { id: 'm2', room_id: 'r', title: 'Dois', game_number: null, played_at: '2026-01-02', created_at: '' },
]
const scores: Score[] = [
  { id: '1', room_id: 'r', match_id: 'm1', player_id: 'a', score: 40000, created_at: '' },
  { id: '2', room_id: 'r', match_id: 'm1', player_id: 'b', score: 42000, created_at: '' },
  { id: '3', room_id: 'r', match_id: 'm2', player_id: 'a', score: 45000, created_at: '' },
  { id: '4', room_id: 'r', match_id: 'm2', player_id: 'b', score: 43000, created_at: '' },
]

describe('ranking', () => {
  it('soma pontos, calcula média e vitórias', () => {
    const result = buildRanking(players, matches, scores)
    expect(result[0]).toMatchObject({ id: 'a', total: 85000, average: 42500, wins: 1, games: 2, best: 45000 })
    expect(result[1]).toMatchObject({ id: 'b', total: 85000, average: 42500, wins: 1, games: 2, best: 43000 })
  })

  it('ordena pelo critério escolhido', () => {
    const extra = scores.filter((item) => item.player_id === 'a' && item.match_id === 'm1')
    expect(buildRanking(players, matches, extra, 'average')[0].id).toBe('a')
    expect(buildRanking(players, matches, scores, 'wins')).toHaveLength(2)
  })

  it('soma a pontuacao por colocacao no modo liga', () => {
    // Beto vence a m1 (5) e fica em 2o na m2 (3); Ana faz o inverso
    const result = buildRanking(players, matches, scores, 'league')
    expect(result.map((player) => [player.id, player.leaguePoints])).toEqual([['a', 8], ['b', 8]])
    expect(result[0]).toMatchObject({ wins: 1, seconds: 1, thirds: 0 })
    expect(getRankingValue(result[0], 'league')).toBe(8)
  })

  it('da a mesma pontuacao para quem empata e pula a colocacao seguinte', () => {
    const trio: Player[] = [...players, { id: 'c', room_id: 'r', nickname: 'Caio', color: '#0f0', created_at: '' }]
    // Ana e Beto empatam em 1o (5 cada) e Caio cai para o 3o lugar (1)
    const tied: Score[] = [
      { id: '1', room_id: 'r', match_id: 'm1', player_id: 'a', score: 42000, created_at: '' },
      { id: '2', room_id: 'r', match_id: 'm1', player_id: 'b', score: 42000, created_at: '' },
      { id: '3', room_id: 'r', match_id: 'm1', player_id: 'c', score: 10000, created_at: '' },
    ]
    const result = buildRanking(trio, [matches[0]], tied, 'league')
    expect(result.map((player) => [player.id, player.leaguePoints])).toEqual([['a', 5], ['b', 5], ['c', 1]])
    expect(result[2]).toMatchObject({ wins: 0, seconds: 0, thirds: 1 })
  })

  it('nao pontua do 4o lugar em diante', () => {
    expect([1, 2, 3, 4, 9].map(leaguePointsForPosition)).toEqual([5, 3, 1, 0, 0])
    expect(LEAGUE_RULE_LABEL).toBe('1º 5 pts · 2º 3 pts · 3º 1 pt · 4º+ 0')
  })

  it('ordena a liga pelos pontos de colocacao, nao pelo placar somado', () => {
    // Ana soma muito mais pontos no TimeGuessr, mas perde as duas partidas
    const lopsided: Score[] = [
      { id: '1', room_id: 'r', match_id: 'm1', player_id: 'a', score: 49000, created_at: '' },
      { id: '2', room_id: 'r', match_id: 'm1', player_id: 'b', score: 49500, created_at: '' },
      { id: '3', room_id: 'r', match_id: 'm2', player_id: 'a', score: 10000, created_at: '' },
      { id: '4', room_id: 'r', match_id: 'm2', player_id: 'b', score: 10500, created_at: '' },
    ]
    expect(buildRanking(players, matches, lopsided, 'league').map((player) => player.id)).toEqual(['b', 'a'])
    expect(buildRanking(players, matches, lopsided, 'total').map((player) => player.id)).toEqual(['b', 'a'])
  })

  it('trata empates como vitória para ambos', () => {
    const tied = scores.map((item) => item.match_id === 'm1' ? { ...item, score: 42000 } : item)
    expect(getWinnerIds('m1', tied)).toEqual(['a', 'b'])
  })

  it('usa o numero oficial para ordenar partidas lancadas retroativamente', () => {
    const imported: GameMatch[] = [
      { id: '1190', room_id: 'r', title: 'TimeGuessr #1190', game_number: 1190, played_at: '2026-09-03', created_at: '2026-09-03T12:00:00Z' },
      { id: '1191', room_id: 'r', title: 'TimeGuessr #1191', game_number: 1191, played_at: '2026-09-01', created_at: '2026-09-01T12:00:00Z' },
    ]
    expect([...imported].sort(compareMatchesNewest).map((match) => match.game_number)).toEqual([1191, 1190])
    expect([...imported].sort(compareMatchesOldest).map((match) => match.game_number)).toEqual([1190, 1191])
  })

  it('mantem a ordem por data quando nao ha numero oficial', () => {
    expect([...matches].sort(compareMatchesNewest).map((match) => match.id)).toEqual(['m2', 'm1'])
    expect([...matches].sort(compareMatchesOldest).map((match) => match.id)).toEqual(['m1', 'm2'])
  })

  it('conta o confronto direto so nas partidas em que os dois pontuaram', () => {
    const [record] = buildHeadToHead('a', players, scores)
    expect(record).toMatchObject({ games: 2, wins: 1, losses: 1, draws: 0 })
    expect(record.opponent.id).toBe('b')

    // sem a partida em que os dois jogaram, nao ha confronto
    const alone = scores.filter((item) => item.player_id === 'a')
    expect(buildHeadToHead('a', players, alone)).toHaveLength(0)
  })

  it('resume a media de cada uma das cinco rodadas', () => {
    const rounds: RoundDetail[] = [1, 2, 3, 4, 5].flatMap((roundNumber) => ([
      { id: `a${roundNumber}`, room_id: 'r', match_id: 'm1', player_id: 'a', round_number: roundNumber, round_score: roundNumber * 1000, year_error: 1, distance_km: 5, created_at: '' },
      { id: `b${roundNumber}`, room_id: 'r', match_id: 'm1', player_id: 'b', round_number: roundNumber, round_score: 2000, year_error: 1, distance_km: 5, created_at: '' },
    ]))
    expect(buildRoundAverages(rounds, 'a').map((item) => item.average)).toEqual([1000, 2000, 3000, 4000, 5000])
    // sem jogador, a media e da liga inteira
    expect(buildRoundAverages(rounds)[0]).toMatchObject({ average: 1500, rounds: 2 })
    // rodada sem dado nenhum nao quebra
    expect(buildRoundAverages([])).toHaveLength(5)
  })

  it('calcula a colocacao dentro da partida e divide empates', () => {
    expect(getMatchPositions('m1', scores).get('b')).toBe(1)
    expect(getMatchPositions('m1', scores).get('a')).toBe(2)
    const tied = scores.map((item) => item.match_id === 'm1' ? { ...item, score: 42000 } : item)
    expect(getMatchPositions('m1', tied).get('a')).toBe(1)
    expect(getMatchPositions('m1', tied).get('b')).toBe(1)
  })

  it('separa quem ja lancou o resultado do dia de quem falta', () => {
    const status = getDailyStatus(players, matches, scores, '2026-01-02')
    expect(status.matches.map((match) => match.id)).toEqual(['m2'])
    expect(status.played.map((item) => item.player.id)).toEqual(['a', 'b'])
    expect(status.missing).toHaveLength(0)

    const partial = getDailyStatus(players, matches, scores.filter((item) => item.player_id === 'a'), '2026-01-02')
    expect(partial.played.map((item) => item.player.id)).toEqual(['a'])
    expect(partial.missing.map((player) => player.id)).toEqual(['b'])
  })

  it('trata um dia sem nenhuma partida', () => {
    const status = getDailyStatus(players, matches, scores, '2026-03-20')
    expect(status.matches).toHaveLength(0)
    expect(status.played).toHaveLength(0)
    expect(status.missing).toHaveLength(2)
  })

  it('monta o texto do ranking para compartilhar', () => {
    const text = buildRankingShareText('Liga dos Crononautas', 'Semana · 1–7 set', buildRanking(players, matches, scores), 2)
    expect(text).toContain('CronoRank — Liga dos Crononautas')
    expect(text).toContain('Semana · 1–7 set · 2 partidas')
    expect(text).toContain('🥇 Ana — 85.000 pts · 1 vitória')

    // no modo liga o texto leva a pontuacao por colocacao e explica a regra
    const league = buildRankingShareText('Liga', 'Tudo', buildRanking(players, matches, scores, 'league'), 2, 'league')
    expect(league).toContain('Pontuação por colocação: 1º 5 pts · 2º 3 pts · 3º 1 pt · 4º+ 0')
    expect(league).toContain('🥇 Ana — 8 pts · 1 vitória')
    // quem nao pontuou no periodo fica de fora da lista
    expect(buildRankingShareText('Liga', 'Tudo', buildRanking(players, matches, []), 0)).toContain('Ninguém pontuou ainda.')
  })

  it('conta a sequencia atual e o recorde de vitorias', () => {
    // Ana perde a m1 e vence a m2: recorde 1, sequencia atual 1
    const streaks = buildStreaks(players, matches, scores)
    expect(streaks.find((item) => item.player.id === 'a')).toMatchObject({ current: 1, longest: 1, games: 2 })
    // Beto vence a m1 e perde a m2: recorde 1, mas a sequencia atual zerou
    expect(streaks.find((item) => item.player.id === 'b')).toMatchObject({ current: 0, longest: 1, games: 2 })
  })

  it('nao zera a sequencia quando o jogador faltou na partida', () => {
    const semBeto = scores.filter((item) => !(item.match_id === 'm1' && item.player_id === 'b'))
    // sem placar na m1, Ana vence sozinha; Beto so jogou a m2 e perdeu
    const streaks = buildStreaks(players, matches, semBeto)
    expect(streaks.find((item) => item.player.id === 'b')).toMatchObject({ games: 1, current: 0 })

    const tres: GameMatch[] = [...matches, { id: 'm3', room_id: 'r', title: 'Tres', game_number: null, played_at: '2026-01-03', created_at: '' }]
    const comFalta: Score[] = [
      { id: '5', room_id: 'r', match_id: 'm1', player_id: 'a', score: 45000, created_at: '' },
      { id: '6', room_id: 'r', match_id: 'm1', player_id: 'b', score: 30000, created_at: '' },
      { id: '7', room_id: 'r', match_id: 'm2', player_id: 'b', score: 30000, created_at: '' },
      { id: '8', room_id: 'r', match_id: 'm3', player_id: 'a', score: 45000, created_at: '' },
      { id: '9', room_id: 'r', match_id: 'm3', player_id: 'b', score: 30000, created_at: '' },
    ]
    // Ana venceu a m1 e a m3, e nao jogou a m2 no meio: a sequencia segue valendo
    expect(buildStreaks(players, tres, comFalta).find((item) => item.player.id === 'a')).toMatchObject({ current: 2, longest: 2, games: 2 })
  })

  it('elege o campeao de cada mes, do mais recente para o mais antigo', () => {
    const doisMeses: GameMatch[] = [
      { id: 'm1', room_id: 'r', title: 'Jan', game_number: null, played_at: '2026-01-10', created_at: '' },
      { id: 'm2', room_id: 'r', title: 'Fev', game_number: null, played_at: '2026-02-10', created_at: '' },
    ]
    const champions = buildMonthlyChampions(players, doisMeses, scores)
    expect(champions.map((item) => item.month)).toEqual(['2026-02', '2026-01'])
    expect(champions[0].champion?.id).toBe('a')
    expect(champions[1].champion?.id).toBe('b')
    expect(champions[0].matches).toBe(1)
  })

  it('destaca o algoz e o fregues no confronto direto', () => {
    const duels = [
      { opponent: players[0], games: 10, wins: 2, losses: 8, draws: 0 },
      { opponent: players[1], games: 10, wins: 7, losses: 3, draws: 0 },
    ]
    const { nemesis, favourite } = getRivalries(duels)
    expect(nemesis?.opponent.id).toBe('a')
    expect(favourite?.opponent.id).toBe('b')

    // saldo empatado nao rende nem algoz nem fregues
    expect(getRivalries([{ opponent: players[0], games: 2, wins: 1, losses: 1, draws: 0 }]))
      .toEqual({ nemesis: null, favourite: null })
    expect(getRivalries([])).toEqual({ nemesis: null, favourite: null })
  })

  it('formata o mes em portugues', () => {
    expect(formatMonthLabel('2026-09')).toBe('Setembro de 2026')
  })

  it('resume a partida com a diferenca para o vencedor', () => {
    const { results } = buildMatchSummary('m1', players, scores, [])
    expect(results.map((item) => [item.player.id, item.position, item.gap]))
      .toEqual([['b', 1, 0], ['a', 2, -2000]])
  })

  it('divide a colocacao e zera a diferenca quando ha empate', () => {
    const tied = scores.map((item) => item.match_id === 'm1' ? { ...item, score: 42000 } : item)
    const { results } = buildMatchSummary('m1', players, tied, [])
    expect(results.every((item) => item.position === 1 && item.gap === 0)).toBe(true)
  })

  it('monta a grade rodada a rodada e aponta a mais dificil', () => {
    const detail = (player: string, roundNumber: number, roundScore: number): RoundDetail => ({
      id: `${player}${roundNumber}`, room_id: 'r', match_id: 'm1', player_id: player,
      round_number: roundNumber, round_score: roundScore, year_error: 2, distance_km: 10, created_at: '',
    })
    const rounds = [
      detail('a', 1, 9000), detail('b', 1, 8000),
      detail('a', 2, 1000), detail('b', 2, 2000),
      detail('a', 3, 7000), detail('b', 3, 7000),
    ]
    const summary = buildMatchSummary('m1', players, scores, rounds)
    // so as rodadas com placar entram na grade
    expect(summary.rounds.map((round) => round.roundNumber)).toEqual([1, 2, 3])
    // nos pontos o melhor e o maior; no erro de ano e na distancia, o menor
    expect(summary.rounds[0].best).toEqual({ score: 9000, year: 2, distance: 10 })
    expect(summary.rounds[2].entries.every((entry) => entry.detail?.round_score === 7000)).toBe(true)
    // a 2a teve a menor media de pontos da turma
    expect(getHardestRound(summary.rounds, 'score')?.roundNumber).toBe(2)
    // e na distancia todos erraram igual, entao a 1a resolve o empate
    expect(getHardestRound(summary.rounds, 'distance')?.roundNumber).toBe(1)
  })

  it('funciona em partida digitada a mao, sem rodadas', () => {
    const summary = buildMatchSummary('m1', players, scores, [])
    expect(summary.rounds).toHaveLength(0)
    expect(getHardestRound(summary.rounds, 'score')).toBeNull()
    expect(summary.results).toHaveLength(2)
  })

  it('escolhe um intervalo redondo em volta dos dados', () => {
    // placares reais de 31k a 48k nao devem virar uma regua de 0 a 50k
    const scale = niceScale(31270, 48120)
    expect(scale.min).toBeLessThanOrEqual(31270)
    expect(scale.max).toBeGreaterThanOrEqual(48120)
    expect(scale.min).toBeGreaterThan(0)
    expect(buildScaleTicks(scale)).toContain(scale.min)
    expect(buildScaleTicks(scale)).toContain(scale.max)
    expect(buildScaleTicks(scale).length).toBeGreaterThanOrEqual(3)
  })

  it('abre espaco quando todos os valores sao iguais', () => {
    const scale = niceScale(40000, 40000)
    expect(scale.max).toBeGreaterThan(scale.min)
    expect(buildScaleTicks(scale).length).toBeGreaterThan(1)
  })

  it('cai num intervalo padrao quando nao ha dado nenhum', () => {
    expect(niceScale(Infinity, -Infinity)).toEqual({ min: 0, max: 50000, step: 10000 })
  })

  it('encurta o rotulo do eixo conforme a grandeza cresce', () => {
    expect(formatCompact(35000, 5000)).toBe('35k')
    expect(formatCompact(37500, 2500)).toBe('37,5k')
    // um ano de acumulado passa de um milhao e precisa virar M
    expect(formatCompact(14600000, 200000)).toBe('14,6M')
    expect(formatCompact(46000000, 200000)).toBe('46,0M')
    expect(formatCompact(840, 100)).toBe('840')
  })

  it('nunca repete o rotulo entre dois tiques vizinhos', () => {
    for (const [min, max] of [[31270, 48120], [180000, 219466], [14200000, 15400000], [45400000, 46000000]]) {
      const scale = niceScale(min, max)
      const labels = buildScaleTicks(scale).map((value) => formatCompact(value, scale.step))
      expect(new Set(labels).size).toBe(labels.length)
    }
  })

  it('formata placares em pt-BR', () => {
    expect(formatScore(48120)).toBe('48.120')
  })
})
