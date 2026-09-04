import { describe, expect, it } from 'vitest'
import { buildRanking, compareMatchesNewest, compareMatchesOldest, formatScore, getWinnerIds } from './ranking'
import type { GameMatch, Player, Score } from '../types'

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

  it('formata placares em pt-BR', () => {
    expect(formatScore(48120)).toBe('48.120')
  })
})
