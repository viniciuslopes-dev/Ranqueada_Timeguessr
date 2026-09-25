import type { GameMatch, Player, RoomSnapshot } from '../types'
import { buildRanking, compareMatchesOldest, getMatchPositions } from './ranking'
import { filterSnapshotByPeriod, resolvePeriod } from './period'

export const LEAGUE_ZONE = 'America/Sao_Paulo'
export const leagueToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: LEAGUE_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    now,
  )
export const shiftDay = (day: string, offset: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
export const weekOf = (day: string) => resolvePeriod({ preset: 'week' }, validDay(day) ? day : leagueToday())!
export const validDay = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) &&
  new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
// A segunda-feira inteira é reservada aos resultados atrasados do domingo.
export const weekClosed = (start: string, today = leagueToday()) => validDay(start) && today >= shiftDay(start, 8)

export type Rules = { effective: string; bestDays: 5 | 7; scoring: 'podium' | 'everyone' }
export type Standing = {
  playerId: string
  nickname: string
  color: string
  points: number
  wins: number
  total: number
  days: number
  counted: number
  position: number
}
export type Season = {
  start: string
  end: string
  rules: Rules
  standings: Standing[]
  days: number
  eligible: boolean
  closedAt: string
  revision: number
  correctedAt?: string
}
export type Earned = { id: string; playerId: string; code: string; date: string; evidence: string; opponentId?: string }
export type Challenge = {
  id: string
  from: string
  to: string
  created: string
  accepted?: string
  start?: string
  end: string
  status: 'pending' | 'active' | 'declined' | 'cancelled'
  excludedMatches?: string[]
}
export type Cosmetic = NonNullable<Player['cosmetic']>
export type ProgressState = {
  version: 1
  seasons: Season[]
  earned: Earned[]
  profiles: Record<string, Cosmetic>
  challenges: Challenge[]
  rules: Rules[]
  emblem: string
  playful: boolean
  name?: string
}
export type ProgressCommand =
  | ({ type: 'profile' } & Cosmetic)
  | { type: 'challenge'; opponentId: string }
  | { type: 'respond'; challengeId: string; response: 'accept' | 'decline' | 'cancel' }
  | {
      type: 'settings'
      bestDays: 5 | 7
      scoring: 'podium' | 'everyone'
      emblem: string
      playful: boolean
      name?: string
    }

export const AVATARS = ['initials', '🧑‍🚀', '🦊', '🦉', '🐱', '🐼', '🦁', '🐸', '🤖', '🧭', '🌍', '🚀']
export const EMBLEMS = ['🌍', '🧭', '🚀', '🏆', '⚔️', '🪐']
export const THEMES = [
  { id: 'navy', name: 'Céu noturno' },
  { id: 'forest', name: 'Expedição' },
  { id: 'dusk', name: 'Pôr do sol' },
]
export const FRAMES = [
  { id: 'none', name: 'Essencial', need: 0 },
  { id: 'mint', name: 'Explorador', need: 1 },
  { id: 'violet', name: 'Viajante', need: 4 },
  { id: 'gold', name: 'Lenda', need: 8 },
]
export const DEFAULT_COSMETIC: Cosmetic = { avatar: 'initials', frame: 'none', title: '', featured: [] }
export const emptyProgress = (): ProgressState => ({
  version: 1,
  seasons: [],
  earned: [],
  profiles: {},
  challenges: [],
  rules: [{ effective: '0001-01-01', bestDays: 7, scoring: 'podium' }],
  emblem: '🌍',
  playful: true,
})
export const rulesFor = (state: ProgressState, start: string): Rules =>
  [...state.rules].filter((r) => r.effective <= start).sort((a, b) => b.effective.localeCompare(a.effective))[0] ??
  emptyProgress().rules[0]

export const ACHIEVEMENTS = [
  {
    code: 'first',
    icon: '🚀',
    name: 'Primeiro salto',
    description: 'Registre sua primeira partida.',
    rarity: 'comum',
    goal: 1,
  },
  {
    code: 'regular',
    icon: '📅',
    name: 'Figurinha carimbada',
    description: 'Jogue em 5 dias diferentes na mesma semana.',
    rarity: 'rara',
    goal: 5,
  },
  {
    code: 'explorer',
    icon: '🧭',
    name: 'Explorador',
    description: 'Jogue em 20 dias diferentes no histórico.',
    rarity: 'rara',
    goal: 20,
  },
  {
    code: 'personal',
    icon: '📈',
    name: 'Superação',
    description: 'Supere seu recorde em uma partida posterior.',
    rarity: 'comum',
    goal: 1,
  },
  {
    code: 'improved',
    icon: '🌱',
    name: 'Sua melhor versão',
    description: 'Melhore a média da semana anterior, com 3 dias jogados em cada uma.',
    rarity: 'rara',
    goal: 1,
  },
  {
    code: 'win',
    icon: '🥇',
    name: 'Primeira vitória',
    description: 'Vença uma partida com pelo menos um adversário.',
    rarity: 'comum',
    goal: 1,
  },
  {
    code: 'streak',
    icon: '🔥',
    name: 'Trinca de respeito',
    description: 'Vença 3 partidas disputadas seguidas. Ausências não apagam a sequência.',
    rarity: 'rara',
    goal: 3,
  },
  {
    code: 'year',
    icon: '🎯',
    name: 'Na mosca',
    description: 'Acerte o ano de uma rodada, com erro zero.',
    rarity: 'rara',
    goal: 1,
  },
  {
    code: 'map',
    icon: '📍',
    name: 'Na porta de casa',
    description: 'Fique a até 1 km em uma rodada.',
    rarity: 'rara',
    goal: 1,
  },
  {
    code: 'perfect',
    icon: '💎',
    name: 'Viagem perfeita',
    description: 'Faça 50.000 pontos em uma partida.',
    rarity: 'épica',
    goal: 1,
  },
  {
    code: 'revenge',
    icon: '⚔️',
    name: 'Hoje tem revanche',
    description: 'Vença um amigo após 3 derrotas consecutivas contra ele.',
    rarity: 'rara',
    goal: 1,
  },
  {
    code: 'close',
    icon: '🤏',
    name: 'Por um fio',
    description: 'Vença um amigo por uma diferença de 1 a 100 pontos.',
    rarity: 'rara',
    goal: 1,
  },
  {
    code: 'comeback',
    icon: '💥',
    name: 'Virada épica',
    description: 'Supere um amigo na 5ª rodada após estar atrás nas quatro primeiras.',
    rarity: 'épica',
    goal: 1,
  },
  {
    code: 'champion',
    icon: '🏆',
    name: 'Campeão semanal',
    description: 'Conquiste o primeiro lugar em uma semana encerrada.',
    rarity: 'rara',
    goal: 1,
  },
  {
    code: 'double',
    icon: '👑',
    name: 'Bicampeão',
    description: 'Conquiste duas semanas consecutivas.',
    rarity: 'épica',
    goal: 2,
  },
  {
    code: 'triple',
    icon: '🪐',
    name: 'Dinastia',
    description: 'Conquiste três semanas consecutivas.',
    rarity: 'épica',
    goal: 3,
  },
] as const

// Uma partida por dia: a importada de menor número oficial, ou a primeira manual.
// Duplicatas e partidas extras continuam no histórico, sem multiplicar os pontos.
export function dailyMatches(snapshot: RoomSnapshot): GameMatch[] {
  const days = new Map<string, GameMatch>()
  const ordered = [...snapshot.matches].sort(
    (a, b) =>
      a.played_at.localeCompare(b.played_at) ||
      (a.game_number ?? Infinity) - (b.game_number ?? Infinity) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  )
  for (const match of ordered) if (!days.has(match.played_at)) days.set(match.played_at, match)
  return [...days.values()]
}

export function weeklyStandings(
  snapshot: RoomSnapshot,
  start: string,
  rules = rulesFor(snapshot.progress ?? emptyProgress(), start),
  asOf = leagueToday(),
) {
  const scoped = filterSnapshotByPeriod(snapshot, { from: start, to: shiftDay(start, 6) })
  const matches = dailyMatches(scoped).filter(
    (m) => m.played_at <= asOf && scoped.scores.filter((s) => s.match_id === m.id).length >= 2,
  )
  const points = rules.scoring === 'everyone' ? [7, 5, 3, 2] : [5, 3, 1]
  const entries = snapshot.players
    .map((player) => {
      const results = matches
        .flatMap((m) => {
          const score = snapshot.scores.find((s) => s.match_id === m.id && s.player_id === player.id)
          if (!score) return []
          const position = getMatchPositions(m.id, snapshot.scores).get(player.id)!
          return [
            {
              points: points[position - 1] ?? (rules.scoring === 'everyone' ? 1 : 0),
              win: position === 1 ? 1 : 0,
              score: score.score,
            },
          ]
        })
        .sort((a, b) => b.points - a.points || b.win - a.win || b.score - a.score)
      const kept = results.slice(0, rules.bestDays)
      return {
        playerId: player.id,
        nickname: player.nickname,
        color: player.color,
        points: kept.reduce((n, r) => n + r.points, 0),
        wins: kept.reduce((n, r) => n + r.win, 0),
        total: kept.reduce((n, r) => n + r.score, 0),
        days: results.length,
        counted: kept.length,
        position: 0,
      }
    })
    .filter((p) => p.days > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.total - a.total || a.nickname.localeCompare(b.nickname))
  for (const [index, entry] of entries.entries()) {
    const same = entries.findIndex((p) => p.points === entry.points && p.wins === entry.wins && p.total === entry.total)
    entry.position = same + 1 || index + 1
  }
  return {
    standings: entries,
    days: matches.length,
    eligible: matches.length >= 2 && entries.filter((p) => p.days >= 2).length >= 2,
  }
}

export function challengeResult(snapshot: RoomSnapshot, challenge: Challenge, today = leagueToday()) {
  const matches = dailyMatches(snapshot)
    .filter(
      (m) =>
        challenge.start &&
        m.played_at >= challenge.start &&
        m.played_at <= challenge.end &&
        !challenge.excludedMatches?.includes(m.id),
    )
    .sort(compareMatchesOldest)
  let wins = 0,
    losses = 0,
    draws = 0,
    games = 0
  for (const match of matches) {
    const a = snapshot.scores.find((s) => s.match_id === match.id && s.player_id === challenge.from)
    const b = snapshot.scores.find((s) => s.match_id === match.id && s.player_id === challenge.to)
    if (!a || !b) continue
    games++
    if (a.score > b.score) wins++
    else if (a.score < b.score) losses++
    else draws++
    if (games === 5) break
  }
  const finished = challenge.status === 'active' && (games === 5 || today > challenge.end)
  return {
    wins,
    losses,
    draws,
    games,
    finished,
    expired: today > challenge.end,
    winner: finished && wins !== losses ? (wins > losses ? challenge.from : challenge.to) : null,
  }
}

export function reconcileProgress(snapshot: RoomSnapshot, now = new Date()): ProgressState {
  const today = leagueToday(now)
  const state = structuredClone(snapshot.progress ?? emptyProgress())
  const history = { ...snapshot, matches: snapshot.matches.filter((m) => m.played_at <= today) }
  const weeks = [
    ...new Set([...history.matches.map((m) => weekOf(m.played_at).from), ...state.seasons.map((s) => s.start)]),
  ].sort()
  // Snapshots são preservados. Só uma alteração real de resultado gera revisão.
  state.seasons = weeks
    .filter((w) => weekClosed(w, today))
    .map((start) => {
      const previous = state.seasons.find((s) => s.start === start)
      const rules = previous?.rules ?? rulesFor(state, start)
      const computed = weeklyStandings(history, start, rules, today)
      const content = { start, end: shiftDay(start, 6), rules, ...computed }
      const changed =
        previous &&
        JSON.stringify({ standings: previous.standings, days: previous.days, eligible: previous.eligible }) !==
          JSON.stringify(computed)
      return {
        ...content,
        closedAt: previous?.closedAt ?? now.toISOString(),
        revision: (previous?.revision ?? 0) + (!previous || changed ? 1 : 0),
        ...(changed
          ? { correctedAt: now.toISOString() }
          : previous?.correctedAt
            ? { correctedAt: previous.correctedAt }
            : {}),
      }
    })
  const earned: Earned[] = []
  const grant = (playerId: string, code: string, date: string, evidence: string, opponentId?: string) => {
    // Um desbloqueio por tipo; títulos semanais repetidos ficam nas temporadas.
    if (!earned.some((e) => e.playerId === playerId && e.code === code))
      earned.push({ id: `${playerId}:${code}`, playerId, code, date, evidence, ...(opponentId ? { opponentId } : {}) })
  }
  const canonical = dailyMatches(history).sort(compareMatchesOldest)
  for (const player of history.players) {
    let best = -1,
      streak = 0
    const days = new Set<string>()
    const weekDays = new Map<string, Set<string>>()
    const losses = new Map<string, number>()
    for (const match of canonical) {
      const own = history.scores.find((s) => s.match_id === match.id && s.player_id === player.id)
      if (!own) continue
      const date = match.played_at
      const evidence = `${match.title} · ${date}`
      grant(player.id, 'first', date, evidence)
      days.add(date)
      if (days.size >= 20) grant(player.id, 'explorer', date, evidence)
      const week = weekOf(date).from
      if (!weekDays.has(week)) weekDays.set(week, new Set())
      weekDays.get(week)!.add(date)
      if (weekDays.get(week)!.size >= 5) grant(player.id, 'regular', date, `Semana de ${week}`)
      if (best >= 0 && own.score > best) grant(player.id, 'personal', date, evidence)
      best = Math.max(best, own.score)
      if (own.score === 50000) grant(player.id, 'perfect', date, evidence)
      const opponents = history.scores.filter((s) => s.match_id === match.id && s.player_id !== player.id)
      if (opponents.length) {
        const win = opponents.every((s) => own.score >= s.score)
        streak = win ? streak + 1 : 0
        if (win) grant(player.id, 'win', date, evidence)
        if (streak >= 3) grant(player.id, 'streak', date, evidence)
      }
      const ownRounds = history.rounds.filter((r) => r.match_id === match.id && r.player_id === player.id)
      if (ownRounds.some((r) => r.year_error === 0)) grant(player.id, 'year', date, evidence)
      if (ownRounds.some((r) => r.distance_km <= 1)) grant(player.id, 'map', date, evidence)
      for (const opponent of opponents) {
        const gap = own.score - opponent.score
        const theirName = history.players.find((p) => p.id === opponent.player_id)?.nickname ?? 'amigo'
        const duelEvidence = `${evidence} · contra ${theirName}`
        if (gap > 0 && (losses.get(opponent.player_id) ?? 0) >= 3)
          grant(player.id, 'revenge', date, duelEvidence, opponent.player_id)
        losses.set(opponent.player_id, gap < 0 ? (losses.get(opponent.player_id) ?? 0) + 1 : 0)
        if (gap > 0 && gap <= 100) grant(player.id, 'close', date, duelEvidence, opponent.player_id)
        const theirRounds = history.rounds.filter((r) => r.match_id === match.id && r.player_id === opponent.player_id)
        if (
          gap > 0 &&
          ownRounds.length === 5 &&
          theirRounds.length === 5 &&
          ownRounds.filter((r) => r.round_number < 5).reduce((n, r) => n + r.round_score, 0) <
            theirRounds.filter((r) => r.round_number < 5).reduce((n, r) => n + r.round_score, 0)
        )
          grant(player.id, 'comeback', date, duelEvidence, opponent.player_id)
      }
    }
    let consecutive = 0,
      last = ''
    for (const season of state.seasons) {
      if (season.eligible && season.standings.some((p) => p.playerId === player.id && p.position === 1)) {
        consecutive = last && shiftDay(last, 7) === season.start ? consecutive + 1 : 1
        last = season.start
        grant(player.id, 'champion', season.end, `Semana de ${season.start}`)
        if (consecutive >= 2) grant(player.id, 'double', season.end, `Semana de ${season.start}`)
        if (consecutive >= 3) grant(player.id, 'triple', season.end, `Semana de ${season.start}`)
      } else consecutive = 0
      const current = canonical.filter((m) => m.played_at >= season.start && m.played_at <= season.end)
      const previous = canonical.filter((m) => m.played_at >= shiftDay(season.start, -7) && m.played_at < season.start)
      const mean = (matches: GameMatch[]) => {
        const values = matches.flatMap((m) =>
          history.scores.filter((s) => s.match_id === m.id && s.player_id === player.id).map((s) => s.score),
        )
        return { count: values.length, average: values.reduce((n, v) => n + v, 0) / values.length }
      }
      const a = mean(current),
        b = mean(previous)
      if (a.count >= 3 && b.count >= 3 && a.average > b.average)
        grant(player.id, 'improved', season.end, `Semana de ${season.start}`)
    }
  }
  state.earned = earned
  // Uma correção pode retirar um desbloqueio: nunca deixar cosméticos inválidos equipados.
  for (const [id, profile] of Object.entries(state.profiles)) {
    const unlocked = new Set(earned.filter((e) => e.playerId === id).map((e) => e.code))
    profile.featured = profile.featured.filter((code) => unlocked.has(code)).slice(0, 3)
    if (!unlocked.has(profile.title)) profile.title = ''
    if (!FRAMES.some((f) => f.id === profile.frame && f.need <= unlocked.size)) profile.frame = 'none'
  }
  return state
}

export function achievementProgress(
  snapshot: RoomSnapshot,
  playerId: string,
  code: string,
  today = leagueToday(),
): number {
  if (snapshot.progress?.earned.some((e) => e.playerId === playerId && e.code === code))
    return ACHIEVEMENTS.find((a) => a.code === code)?.goal ?? 1
  const matches = dailyMatches(snapshot).filter(
    (m) => m.played_at <= today && snapshot.scores.some((s) => s.match_id === m.id && s.player_id === playerId),
  )
  if (code === 'regular') return matches.filter((m) => m.played_at >= weekOf(today).from).length
  if (code === 'explorer') return matches.length
  if (code === 'streak') {
    let streak = 0
    for (const m of [...matches].sort(compareMatchesOldest)) {
      const scores = snapshot.scores.filter((s) => s.match_id === m.id)
      if (scores.length < 2) continue
      const own = scores.find((s) => s.player_id === playerId)!
      streak = scores.every((s) => s.score <= own.score) ? streak + 1 : 0
    }
    return streak
  }
  if (code === 'double' || code === 'triple') {
    let count = 0
    let nextWeek = ''
    for (const season of [...(snapshot.progress?.seasons ?? [])].sort((a, b) => b.start.localeCompare(a.start))) {
      if (!season.eligible || !season.standings.some((s) => s.playerId === playerId && s.position === 1)) break
      if (nextWeek && shiftDay(season.start, 7) !== nextWeek) break
      nextWeek = season.start
      count++
    }
    return count
  }
  return 0
}

export function applyProgressCommand(
  snapshot: RoomSnapshot,
  actor: string,
  command: ProgressCommand,
  now = new Date(),
): ProgressState {
  const state = reconcileProgress(snapshot, now)
  if (!snapshot.players.some((p) => p.id === actor && !p.archived))
    throw new Error('Escolha um perfil ativo para continuar.')
  const today = leagueToday(now)
  if (command.type === 'profile') {
    const unlocked = state.earned.filter((e) => e.playerId === actor).map((e) => e.code)
    if (
      !AVATARS.includes(command.avatar) ||
      !FRAMES.some((f) => f.id === command.frame && f.need <= unlocked.length) ||
      (command.title && !unlocked.includes(command.title)) ||
      !Array.isArray(command.featured) ||
      command.featured.length > 3 ||
      command.featured.some((c) => !unlocked.includes(c))
    )
      throw new Error('Escolha apenas itens já desbloqueados.')
    if (command.theme && !THEMES.some((t) => t.id === command.theme)) throw new Error('Tema inválido.')
    state.profiles[actor] = {
      avatar: command.avatar,
      frame: command.frame,
      title: command.title,
      featured: [...new Set(command.featured)],
      theme: command.theme ?? 'navy',
    }
  } else if (command.type === 'settings') {
    if (
      ![5, 7].includes(command.bestDays) ||
      !['podium', 'everyone'].includes(command.scoring) ||
      !EMBLEMS.includes(command.emblem) ||
      typeof command.playful !== 'boolean'
    )
      throw new Error('Configuração inválida.')
    const effective = shiftDay(weekOf(today).from, 7)
    state.rules = [
      ...state.rules.filter((r) => r.effective !== effective),
      { effective, bestDays: command.bestDays, scoring: command.scoring },
    ]
    state.emblem = command.emblem
    state.playful = command.playful
    if (command.name !== undefined) {
      if (typeof command.name !== 'string' || command.name.trim().length < 2 || command.name.trim().length > 40)
        throw new Error('O nome da liga deve ter entre 2 e 40 caracteres.')
      state.name = command.name.trim()
    }
  } else if (command.type === 'challenge') {
    if (actor === command.opponentId || !snapshot.players.some((p) => p.id === command.opponentId && !p.archived))
      throw new Error('Escolha outro jogador ativo.')
    if (
      state.challenges.some(
        (c) =>
          [c.from, c.to].includes(actor) &&
          [c.from, c.to].includes(command.opponentId) &&
          ['pending', 'active'].includes(c.status) &&
          !challengeResult(snapshot, c, today).finished &&
          c.end >= today,
      )
    )
      throw new Error('Vocês já têm um desafio em aberto.')
    state.challenges.push({
      id: crypto.randomUUID(),
      from: actor,
      to: command.opponentId,
      created: now.toISOString(),
      end: shiftDay(today, 7),
      status: 'pending',
    })
  } else if (command.type === 'respond') {
    const challenge = state.challenges.find((c) => c.id === command.challengeId)
    if (!challenge || challenge.status !== 'pending' || challenge.end < today)
      throw new Error('Esse convite já foi respondido ou expirou.')
    if (command.response === 'cancel' && challenge.from === actor) challenge.status = 'cancelled'
    else if (challenge.to === actor && ['accept', 'decline'].includes(command.response)) {
      challenge.status = command.response === 'accept' ? 'active' : 'declined'
      if (challenge.status === 'active') {
        challenge.accepted = now.toISOString()
        challenge.start = today
        challenge.end = shiftDay(today, 13)
        challenge.excludedMatches = snapshot.matches
          .filter((m) =>
            snapshot.scores.some((s) => s.match_id === m.id && [challenge.from, challenge.to].includes(s.player_id)),
          )
          .map((m) => m.id)
      }
    } else throw new Error('Somente o jogador convidado pode aceitar este desafio.')
  } else throw new Error('Ação inválida.')
  return state
}

export function decoratePlayers(snapshot: RoomSnapshot, today = leagueToday()): RoomSnapshot {
  const state = snapshot.progress ?? emptyProgress()
  const last = state.seasons.find((s) => s.start === shiftDay(weekOf(today).from, -7))
  return {
    ...snapshot,
    room: { ...snapshot.room, name: state.name || snapshot.room.name },
    players: snapshot.players.map((p) => ({
      ...p,
      cosmetic: state.profiles[p.id],
      weeklyChampion: !!last?.eligible && last.standings.some((s) => s.playerId === p.id && s.position === 1),
    })),
  }
}

export function weeklyMissions(snapshot: RoomSnapshot, playerId: string, today = leagueToday()) {
  const week = weekOf(today)
  const scoped = filterSnapshotByPeriod(snapshot, week)
  const matches = dailyMatches(scoped).filter((m) => m.played_at <= today)
  const own = matches.flatMap((m) => scoped.scores.filter((s) => s.match_id === m.id && s.player_id === playerId))
  const rotation = Math.floor(Date.parse(`${week.from}T12:00:00Z`) / 604800000) % 2
  return [
    {
      name: 'Marque presença',
      description: 'Três dias no seu ritmo. Não precisam ser seguidos.',
      current: own.length,
      goal: 3,
      icon: '📅',
    },
    {
      name: rotation ? 'Busque seu melhor' : 'Uma boa viagem',
      description: rotation ? 'Faça 40.000 pontos em uma partida.' : 'Faça 30.000 pontos em duas partidas.',
      current: own.filter((s) => s.score >= (rotation ? 40000 : 30000)).length,
      goal: rotation ? 1 : 2,
      icon: '🎯',
    },
    {
      name: 'Juntos na disputa',
      description: 'Jogue duas partidas com pelo menos um amigo.',
      current: matches.filter(
        (m) => own.some((s) => s.match_id === m.id) && scoped.scores.filter((s) => s.match_id === m.id).length >= 2,
      ).length,
      goal: 2,
      icon: '🤝',
    },
  ]
}

export const playerTrophies = (state: ProgressState, playerId: string) =>
  state.seasons
    .filter((s) => s.eligible)
    .flatMap((s) =>
      s.standings
        .filter((p) => p.playerId === playerId && p.position <= 3)
        .map((p) => ({ ...p, start: s.start, end: s.end, revision: s.revision })),
    )
export const historicalRanking = (snapshot: RoomSnapshot) =>
  buildRanking(snapshot.players, snapshot.matches, snapshot.scores, 'league')
