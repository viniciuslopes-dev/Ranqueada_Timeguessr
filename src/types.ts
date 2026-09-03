export type Player = {
  id: string
  room_id: string
  nickname: string
  color: string
  created_at: string
}

export type GameMatch = {
  id: string
  room_id: string
  title: string
  played_at: string
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
}

export type MatchInput = {
  title: string
  playedAt: string
  scores: Array<{ playerId: string; score: number }>
}

export type RankingMetric = 'total' | 'average' | 'wins'

export type PlayerRanking = Player & {
  total: number
  average: number
  wins: number
  games: number
  best: number
  trend: number
  form: Array<'win' | 'played' | 'missed'>
}
