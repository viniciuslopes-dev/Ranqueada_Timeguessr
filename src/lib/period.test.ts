import { describe, expect, it } from 'vitest'
import { filterSnapshotByPeriod, resolvePeriod, toDateKey } from './period'
import type { RoomSnapshot } from '../types'

const snapshot: RoomSnapshot = {
  room: { id: 'r', name: 'Liga', invite_code: 'ABC123', created_at: '' },
  players: [{ id: 'a', room_id: 'r', nickname: 'Ana', color: '#ff7043', created_at: '' }],
  matches: [
    { id: 'm1', room_id: 'r', title: 'Antes', game_number: 1189, played_at: '2026-08-31', created_at: '' },
    { id: 'm2', room_id: 'r', title: 'Dentro', game_number: 1190, played_at: '2026-09-03', created_at: '' },
    { id: 'm3', room_id: 'r', title: 'Depois', game_number: 1191, played_at: '2026-09-08', created_at: '' },
  ],
  scores: [
    { id: 's1', room_id: 'r', match_id: 'm1', player_id: 'a', score: 30000, created_at: '' },
    { id: 's2', room_id: 'r', match_id: 'm2', player_id: 'a', score: 40000, created_at: '' },
    { id: 's3', room_id: 'r', match_id: 'm3', player_id: 'a', score: 50000, created_at: '' },
  ],
  rounds: [
    { id: 'd1', room_id: 'r', match_id: 'm1', player_id: 'a', round_number: 1, round_score: 6000, year_error: 3, distance_km: 12, created_at: '' },
    { id: 'd2', room_id: 'r', match_id: 'm2', player_id: 'a', round_number: 1, round_score: 8000, year_error: 1, distance_km: 4, created_at: '' },
  ],
}

describe('period', () => {
  it('monta a chave da data no fuso local, sem adiantar o dia', () => {
    // 23h30 de 3 de setembro no Brasil ja e dia 4 em UTC
    expect(toDateKey(new Date(2026, 8, 3, 23, 30))).toBe('2026-09-03')
  })

  it('usa a semana de segunda a domingo', () => {
    // 2026-09-03 e uma quinta-feira
    expect(resolvePeriod({ preset: 'week' }, '2026-09-03')).toEqual({ from: '2026-08-31', to: '2026-09-06' })
    // no proprio domingo a semana continua sendo a que comecou na segunda
    expect(resolvePeriod({ preset: 'week' }, '2026-09-06')).toEqual({ from: '2026-08-31', to: '2026-09-06' })
    // e na segunda ela vira
    expect(resolvePeriod({ preset: 'week' }, '2026-09-07')).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })

  it('cobre o mes inteiro, inclusive fevereiro bissexto', () => {
    expect(resolvePeriod({ preset: 'month' }, '2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(resolvePeriod({ preset: 'month' }, '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('nao filtra nada quando o periodo e "tudo"', () => {
    expect(resolvePeriod({ preset: 'all' })).toBeNull()
    expect(filterSnapshotByPeriod(snapshot, null).matches).toHaveLength(3)
  })

  it('endireita um intervalo digitado ao contrario', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-08', to: '2026-09-01' }))
      .toEqual({ from: '2026-09-01', to: '2026-09-08' })
  })

  it('recorta placares e rodadas junto com as partidas, incluindo os limites', () => {
    const filtered = filterSnapshotByPeriod(snapshot, { from: '2026-08-31', to: '2026-09-03' })
    expect(filtered.matches.map((match) => match.id)).toEqual(['m1', 'm2'])
    expect(filtered.scores.map((score) => score.id)).toEqual(['s1', 's2'])
    expect(filtered.rounds.map((round) => round.id)).toEqual(['d1', 'd2'])
    expect(filtered.players).toHaveLength(1)
  })
})
