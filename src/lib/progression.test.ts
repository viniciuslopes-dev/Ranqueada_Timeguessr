import { describe, expect, it } from 'vitest'
import type { RoomSnapshot } from '../types'
import {
  achievementProgress,
  applyProgressCommand,
  challengeResult,
  decoratePlayers,
  emptyProgress,
  leagueToday,
  reconcileProgress,
  rulesFor,
  sameJson,
  validDay,
  weekClosed,
  weeklyStandings,
  type ProgressState,
} from './progression'

// Inverte a ordem das chaves de todos os objetos, como o jsonb faz ao devolver
// o estado reordenado do banco.
const reorderKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(reorderKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, item]) => [key, reorderKeys(item)]),
        )
      : value

const makeRoom = (): RoomSnapshot => ({
  room: { id: 'room', name: 'Amigos', invite_code: 'ABCDEF', created_at: '' },
  players: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id,
    room_id: 'room',
    nickname: id.toUpperCase(),
    color: '#ff7043',
    created_at: '',
  })),
  matches: [],
  scores: [],
  rounds: [],
  progress: emptyProgress(),
})
function match(
  room: RoomSnapshot,
  day: string,
  values: number[],
  id = `m${room.matches.length}`,
  gameNumber: number | null = null,
) {
  room.matches.push({
    id,
    room_id: 'room',
    title: id,
    game_number: gameNumber,
    played_at: day,
    created_at: `${day}T12:00:00Z`,
  })
  room.scores.push(
    ...values.map((score, index) => ({
      id: `${id}:${index}`,
      room_id: 'room',
      match_id: id,
      player_id: room.players[index].id,
      score,
      created_at: `${day}T12:00:00Z`,
    })),
  )
  return id
}
const tuesday = new Date('2026-09-22T12:00:00Z')

describe('campeonato semanal', () => {
  it('usa Brasília e só fecha após a segunda inteira', () => {
    expect(leagueToday(new Date('2026-09-22T02:59:00Z'))).toBe('2026-09-21')
    expect(weekClosed('2026-09-14', '2026-09-21')).toBe(false)
    expect(weekClosed('2026-09-14', '2026-09-22')).toBe(true)
    expect(validDay('2026-02-30')).toBe(false)
    expect(validDay('2028-02-29')).toBe(true)
  })
  it('não dá pontos competitivos sem adversário nem prêmio com participação insuficiente', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [50000])
    expect(weeklyStandings(room, '2026-09-14').standings).toEqual([])
    const state = reconcileProgress(room, tuesday)
    expect(state.seasons[0].eligible).toBe(false)
    expect(state.earned.some((e) => e.code === 'win' || e.code === 'champion')).toBe(false)
    expect(state.earned.some((e) => e.code === 'first')).toBe(true)
  })
  it('conta uma partida por dia e prefere o número oficial', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [50000, 0], 'manual')
    match(room, '2026-09-14', [1000, 2000], 'official', 100)
    match(room, '2026-09-14', [50000, 0], 'extra', 101)
    const result = weeklyStandings(room, '2026-09-14')
    expect(result.days).toBe(1)
    expect(result.standings[0]).toMatchObject({ playerId: 'b', points: 5, days: 1 })
  })
  it('divide títulos em empate completo sem usar ordem alfabética', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [40000, 40000, 30000])
    match(room, '2026-09-15', [40000, 40000, 30000])
    const state = reconcileProgress(room, tuesday)
    expect(state.seasons[0].standings.map((p) => p.position)).toEqual([1, 1, 3])
    expect(state.earned.filter((e) => e.code === 'champion').map((e) => e.playerId)).toEqual(['a', 'b'])
  })
  it('desempata por vitórias antes de placar somado', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [10000, 5000])
    match(room, '2026-09-15', [10000, 5000])
    match(room, '2026-09-16', [0, 50000])
    expect(weeklyStandings(room, '2026-09-14').standings[0].playerId).toBe('a')
  })
  it('oferece melhores cinco dias e pontuação para todos', () => {
    const room = makeRoom()
    for (let i = 14; i <= 20; i++) match(room, `2026-09-${i}`, [50000, 40000, 30000, 20000, 10000])
    const result = weeklyStandings(room, '2026-09-14', { effective: '', bestDays: 5, scoring: 'everyone' })
    expect(result.standings[0]).toMatchObject({ points: 35, counted: 5, days: 7 })
    expect(result.standings[4].points).toBe(5)
  })
  it('é idempotente e revisa prêmios após correção', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [40000, 30000])
    match(room, '2026-09-15', [40000, 30000])
    room.progress = reconcileProgress(room, tuesday)
    expect(reconcileProgress(room, new Date('2026-09-23T12:00:00Z'))).toEqual(room.progress)
    room.scores
      .filter((s) => s.player_id === 'b')
      .forEach((s) => {
        s.score = 50000
      })
    const updated = reconcileProgress(room, tuesday)
    expect(updated.seasons[0].revision).toBe(2)
    expect(updated.earned.filter((e) => e.code === 'champion').map((e) => e.playerId)).toEqual(['b'])
    expect(reconcileProgress({ ...room, progress: updated }, tuesday)).toEqual(updated)
  })
  it('compara estados sem depender da ordem das chaves', () => {
    expect(sameJson({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 })).toBe(true)
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true)
  })
  it('não revisa semanas quando o estado volta do banco com as chaves reordenadas', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [40000, 30000])
    match(room, '2026-09-15', [40000, 30000])
    room.progress = reorderKeys(reconcileProgress(room, tuesday)) as ProgressState
    const next = reconcileProgress(room, new Date('2026-09-23T12:00:00Z'))
    expect(next.seasons[0].revision).toBe(1)
    expect(next.seasons[0].correctedAt).toBeUndefined()
    expect(sameJson(next, room.progress)).toBe(true)
  })
  it('arquivar jogador preserva títulos e placares', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [40000, 30000])
    match(room, '2026-09-15', [40000, 30000])
    room.progress = reconcileProgress(room, tuesday)
    room.players[0].archived = true
    expect(reconcileProgress(room, tuesday).seasons).toEqual(room.progress.seasons)
  })
  it('distingue campeão anterior de líder provisório', () => {
    const room = makeRoom()
    match(room, '2026-09-14', [40000, 30000])
    match(room, '2026-09-15', [40000, 30000])
    match(room, '2026-09-21', [1000, 50000])
    room.progress = reconcileProgress(room, tuesday)
    expect(decoratePlayers(room, '2026-09-22').players[0].weeklyChampion).toBe(true)
    expect(decoratePlayers(room, '2026-09-22').players[1].weeklyChampion).toBe(false)
  })
})

describe('conquistas, personalização e rivalidades', () => {
  it('não trata empate como revanche nem vitória por margem estreita', () => {
    const room = makeRoom()
    for (let i = 14; i < 17; i++) match(room, `2026-09-${i}`, [30000, 40000])
    match(room, '2026-09-17', [40000, 40000])
    expect(
      reconcileProgress(room, tuesday)
        .earned.filter((e) => e.playerId === 'a')
        .some((e) => ['revenge', 'close'].includes(e.code)),
    ).toBe(false)
  })
  it('concede revanche e margem estreita com evidência do adversário', () => {
    const room = makeRoom()
    for (let i = 14; i < 17; i++) match(room, `2026-09-${i}`, [30000, 40000])
    match(room, '2026-09-17', [40001, 40000])
    expect(
      reconcileProgress(room, tuesday).earned.filter(
        (e) => e.playerId === 'a' && ['revenge', 'close'].includes(e.code),
      ),
    ).toHaveLength(2)
  })
  it('exige cinco rodadas dos dois para reconhecer uma virada', () => {
    const room = makeRoom()
    const id = match(room, '2026-09-14', [41000, 40000])
    for (const playerId of ['a', 'b'])
      for (let round = 1; round <= 5; round++)
        room.rounds.push({
          id: `${playerId}${round}`,
          room_id: 'room',
          match_id: id,
          player_id: playerId,
          round_number: round,
          round_score: playerId === 'b' ? 8000 : round === 5 ? 10000 : 7750,
          year_error: 0,
          distance_km: 1,
          created_at: '',
        })
    expect(reconcileProgress(room, tuesday).earned.some((e) => e.code === 'comeback' && e.playerId === 'a')).toBe(true)
    room.rounds.pop()
    expect(reconcileProgress(room, tuesday).earned.some((e) => e.code === 'comeback')).toBe(false)
  })
  it('não permite equipar recompensas bloqueadas', () => {
    const room = makeRoom()
    expect(() =>
      applyProgressCommand(
        room,
        'a',
        { type: 'profile', avatar: '🦊', frame: 'gold', title: '', featured: [] },
        tuesday,
      ),
    ).toThrow('desbloqueados')
    expect(() =>
      applyProgressCommand(
        room,
        'a',
        { type: 'profile', avatar: '🦊', frame: 'none', title: 'champion', featured: [] },
        tuesday,
      ),
    ).toThrow()
  })
  it('muda regras apenas para a semana seguinte', () => {
    const room = makeRoom()
    const state = applyProgressCommand(
      room,
      'a',
      { type: 'settings', bestDays: 5, scoring: 'everyone', emblem: '🚀', playful: false },
      tuesday,
    )
    expect(rulesFor(state, '2026-09-21').scoring).toBe('podium')
    expect(rulesFor(state, '2026-09-28')).toMatchObject({ bestDays: 5, scoring: 'everyone' })
  })
  it('exige aceite do destinatário e não aceita partidas já lançadas', () => {
    const room = makeRoom()
    match(room, '2026-09-22', [40000, 30000])
    room.progress = applyProgressCommand(room, 'a', { type: 'challenge', opponentId: 'b' }, tuesday)
    const id = room.progress.challenges[0].id
    expect(() =>
      applyProgressCommand(room, 'a', { type: 'respond', challengeId: id, response: 'accept' }, tuesday),
    ).toThrow()
    room.progress = applyProgressCommand(room, 'b', { type: 'respond', challengeId: id, response: 'accept' }, tuesday)
    expect(challengeResult(room, room.progress.challenges[0], '2026-09-22').games).toBe(0)
    match(room, '2026-09-23', [41000, 40000])
    match(room, '2026-09-24', [50000])
    expect(challengeResult(room, room.progress.challenges[0], '2026-09-24')).toMatchObject({
      games: 1,
      wins: 1,
      finished: false,
    })
  })
  it('confronto expirado sem jogos não produz vencedor', () => {
    const room = makeRoom()
    const result = challengeResult(
      room,
      { id: 'x', from: 'a', to: 'b', created: '', start: '2026-09-01', end: '2026-09-14', status: 'active' },
      '2026-09-22',
    )
    expect(result).toMatchObject({ finished: true, winner: null, games: 0 })
  })
  it('cinco dias de presença não precisam ser consecutivos', () => {
    const room = makeRoom()
    for (const i of [14, 15, 17, 19]) match(room, `2026-09-${i}`, [10000])
    expect(achievementProgress(room, 'a', 'regular', '2026-09-20')).toBe(4)
    match(room, '2026-09-20', [10000])
    expect(reconcileProgress(room, tuesday).earned.some((e) => e.code === 'regular')).toBe(true)
  })
  it('semanas não consecutivas não concedem bicampeonato', () => {
    const room = makeRoom()
    for (const day of ['2026-08-31', '2026-09-01', '2026-09-14', '2026-09-15']) match(room, day, [50000, 40000])
    expect(reconcileProgress(room, tuesday).earned.some((e) => e.code === 'double')).toBe(false)
  })
})
