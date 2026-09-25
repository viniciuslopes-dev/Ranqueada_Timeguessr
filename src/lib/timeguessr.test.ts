import { describe, expect, it } from 'vitest'
import type { GameMatch } from '../types'
import { deduceGameDate } from './timeguessr'

const game = (gameNumber: number | null, playedAt: string): GameMatch => ({
  id: `${gameNumber ?? 'manual'}-${playedAt}`,
  room_id: 'room',
  title: gameNumber ? `TimeGuessr #${gameNumber}` : 'Manual',
  game_number: gameNumber,
  played_at: playedAt,
  created_at: `${playedAt}T12:00:00Z`,
})

describe('deduceGameDate', () => {
  it('usa a data do mesmo número já registrado na liga', () => {
    const matches = [game(1191, '2026-09-14'), game(1190, '2026-09-13')]
    expect(deduceGameDate(1191, matches, '2026-09-22')).toEqual({ date: '2026-09-14', source: 'existing' })
  })

  it('deduz um número novo pela distância até os jogos já importados', () => {
    // o resultado de domingo colado na segunda cai no domingo, não na segunda
    const matches = [game(1188, '2026-09-17'), game(1189, '2026-09-18')]
    expect(deduceGameDate(1191, matches, '2026-09-21')).toEqual({ date: '2026-09-20', source: 'history' })
  })

  it('ignora uma data lançada errado no passado', () => {
    const matches = [game(100, '2026-09-01'), game(101, '2026-09-02'), game(102, '2026-09-04'), game(103, '2026-09-04')]
    expect(deduceGameDate(104, matches, '2026-09-10').date).toBe('2026-09-05')
  })

  it('nunca passa de hoje', () => {
    expect(deduceGameDate(106, [game(100, '2026-09-01')], '2026-09-05')).toEqual({
      date: '2026-09-05',
      source: 'history',
    })
  })

  it('sem jogos numerados, fica hoje', () => {
    expect(deduceGameDate(1191, [game(null, '2026-09-01')], '2026-09-05')).toEqual({
      date: '2026-09-05',
      source: 'today',
    })
    expect(deduceGameDate(1191, [], '2026-09-05')).toEqual({ date: '2026-09-05', source: 'today' })
  })
})
