export type Player = {
  id: string
  room_id: string
  nickname: string
  color: string
  created_at: string
  archived?: boolean
  cosmetic?: { avatar: string; frame: string; title: string; featured: string[]; theme?: string }
  weeklyChampion?: boolean
}

export type GameMatch = {
  id: string
  room_id: string
  title: string
  game_number: number | null
  played_at: string
  created_at: string
}

export type RoundDetail = {
  id: string
  room_id: string
  match_id: string
  player_id: string
  round_number: number
  round_score: number
  year_error: number
  distance_km: number
  created_at: string
}

export type Score = {
  id: string
  room_id: string
  match_id: string
  player_id: string
  score: number
  created_at: string
}

export type Room = {
  id: string
  name: string
  invite_code: string
  created_at: string
}

export type RoomSnapshot = {
  room: Room
  players: Player[]
  matches: GameMatch[]
  scores: Score[]
  rounds: RoundDetail[]
  progress?: import('./lib/progression').ProgressState
  claimedPlayers?: string[]
}

export type MatchInput = {
  correctionReason?: string
  title: string
  playedAt: string
  scores: Array<{ playerId: string; score: number }>
}

export type MatchUpdateInput = {
  correctionReason?: string
  title: string
  playedAt: string
}

export type ImportResultInput = {
  correctionReason?: string
  playerId: string
  gameNumber: number
  playedAt: string
  totalScore: number
  rounds: Array<{
    roundNumber: number
    roundScore: number
    yearError: number
    distanceKm: number
  }>
}

export type RankingMetric = 'total' | 'average' | 'wins' | 'league'

export type PlayerRanking = Player & {
  total: number
  average: number
  wins: number
  seconds: number
  thirds: number
  // soma da pontuacao por colocacao (5/3/1) de cada partida
  leaguePoints: number
  games: number
  best: number
  trend: number
  form: Array<'win' | 'played' | 'missed'>
}
