import type { GameMatch, ImportResultInput, MatchInput, MatchUpdateInput, Player, RoomSnapshot } from '../types'
import { ApiError, isNeonApiEnabled, neonApi } from './api'
import { localDaysAgo, localToday } from './period'
import { readAccessToken, readCachedRoom, saveAccessToken, saveCachedRoom, type CachedRoom } from './roomAccess'

const DEMO_STORAGE_KEY = 'cronorank:demo-data:v1'
const DEMO_ROOM_ID = 'demo-room'
const today = localToday
const daysAgo = localDaysAgo
const uid = () => crypto.randomUUID()

// 401 para cair na mesma trilha de "acesso revogado" do servidor: sem token
// guardado, so o codigo da liga resolve.
function requireToken(roomId: string): string {
  const token = readAccessToken(roomId)
  if (!token) throw new ApiError('Acesso à liga não encontrado. Entre novamente usando o código.', 401)
  return token
}

function seedDemo(): RoomSnapshot {
  const players: Player[] = [
    { id: 'demo-lia', room_id: DEMO_ROOM_ID, nickname: 'Lia', color: '#ff7043', created_at: new Date().toISOString() },
    { id: 'demo-caio', room_id: DEMO_ROOM_ID, nickname: 'Caio', color: '#4f7cff', created_at: new Date().toISOString() },
    { id: 'demo-bia', room_id: DEMO_ROOM_ID, nickname: 'Bia', color: '#8b5cf6', created_at: new Date().toISOString() },
    { id: 'demo-theo', room_id: DEMO_ROOM_ID, nickname: 'Theo', color: '#23a982', created_at: new Date().toISOString() },
  ]
  const matches = [
    { id: 'demo-match-1', room_id: DEMO_ROOM_ID, title: 'Daily #1189', game_number: null, played_at: daysAgo(6), created_at: new Date().toISOString() },
    { id: 'demo-match-2', room_id: DEMO_ROOM_ID, title: 'Daily #1190', game_number: null, played_at: daysAgo(4), created_at: new Date().toISOString() },
    { id: 'demo-match-3', room_id: DEMO_ROOM_ID, title: 'Sextou pelo mundo', game_number: null, played_at: daysAgo(2), created_at: new Date().toISOString() },
    { id: 'demo-match-4', room_id: DEMO_ROOM_ID, title: 'Daily de hoje', game_number: null, played_at: today(), created_at: new Date().toISOString() },
  ]
  const values = [
    [42180, 39840, 44760, 36220],
    [46540, 45210, 43890, 41930],
    [43200, 47890, 44980, 40110],
    [48120, 46330, 47240, 44180],
  ]
  return {
    room: { id: DEMO_ROOM_ID, name: 'Liga dos Crononautas', invite_code: 'DEMO26', created_at: new Date().toISOString() },
    players,
    matches,
    scores: matches.flatMap((match, matchIndex) => players.map((player, playerIndex) => ({
      id: `demo-score-${matchIndex}-${playerIndex}`,
      room_id: DEMO_ROOM_ID,
      match_id: match.id,
      player_id: player.id,
      score: values[matchIndex][playerIndex],
      created_at: new Date().toISOString(),
    }))),
    rounds: [],
  }
}

function getDemoData(): Record<string, RoomSnapshot> {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY)
  if (raw) {
    try { return JSON.parse(raw) as Record<string, RoomSnapshot> }
    catch { localStorage.removeItem(DEMO_STORAGE_KEY) }
  }
  const initial = { [DEMO_ROOM_ID]: seedDemo() }
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initial))
  return initial
}

function saveDemoRoom(snapshot: RoomSnapshot) {
  const data = getDemoData()
  data[snapshot.room.id] = snapshot
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('cronorank:local-change'))
}

export const repository = {
  isDemo: !isNeonApiEnabled,
  demoRoomId: DEMO_ROOM_ID,

  async initialize() {},

  // Copia local do ultimo ranking carregado, usada quando o app abre sem rede.
  readCachedRoom(roomId: string): CachedRoom | null {
    return isNeonApiEnabled ? readCachedRoom(roomId) : null
  },

  async loadRoom(roomId: string): Promise<RoomSnapshot> {
    if (isNeonApiEnabled) {
      const snapshot = await neonApi.loadRoom(roomId, requireToken(roomId))
      saveCachedRoom(roomId, snapshot)
      return snapshot
    }
    const snapshot = getDemoData()[roomId]
    if (!snapshot) throw new Error('Sala não encontrada neste aparelho.')
    snapshot.rounds ??= []
    snapshot.matches = snapshot.matches.map((match) => ({ ...match, game_number: match.game_number ?? null }))
    return structuredClone(snapshot)
  },

  async createRoom(name: string, nickname: string): Promise<{ roomId: string; code: string }> {
    if (isNeonApiEnabled) {
      const result = await neonApi.createRoom(name, nickname)
      saveAccessToken(result.roomId, result.accessToken)
      return { roomId: result.roomId, code: result.code! }
    }
    const roomId = uid()
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    saveDemoRoom({
      room: { id: roomId, name, invite_code: code, created_at: new Date().toISOString() },
      players: [{ id: uid(), room_id: roomId, nickname, color: '#ff7043', created_at: new Date().toISOString() }],
      matches: [], scores: [], rounds: [],
    })
    return { roomId, code }
  },

  async joinRoom(code: string, nickname: string): Promise<{ roomId: string }> {
    if (isNeonApiEnabled) {
      const result = await neonApi.joinRoom(code.toUpperCase(), nickname)
      saveAccessToken(result.roomId, result.accessToken)
      return { roomId: result.roomId }
    }
    const room = Object.values(getDemoData()).find((item) => item.room.invite_code === code.toUpperCase())
    if (!room) throw new Error('Código não encontrado no modo local.')
    return { roomId: room.room.id }
  },

  async addPlayer(roomId: string, nickname: string, color: string) {
    if (isNeonApiEnabled) { await neonApi.addPlayer(roomId, nickname, color, requireToken(roomId)); return }
    const room = await this.loadRoom(roomId)
    room.players.push({ id: uid(), room_id: roomId, nickname, color, created_at: new Date().toISOString() })
    saveDemoRoom(room)
  },

  async updatePlayer(player: Player, nickname: string, color: string) {
    if (isNeonApiEnabled) { await neonApi.updatePlayer(player.room_id, player.id, nickname, color, requireToken(player.room_id)); return }
    const room = await this.loadRoom(player.room_id)
    room.players = room.players.map((item) => item.id === player.id ? { ...item, nickname, color } : item)
    saveDemoRoom(room)
  },

  async deletePlayer(player: Player) {
    if (isNeonApiEnabled) { await neonApi.deletePlayer(player.room_id, player.id, requireToken(player.room_id)); return }
    const room = await this.loadRoom(player.room_id)
    room.players = room.players.filter((item) => item.id !== player.id)
    room.scores = room.scores.filter((item) => item.player_id !== player.id)
    room.rounds = room.rounds.filter((item) => item.player_id !== player.id)
    saveDemoRoom(room)
  },

  async addMatch(roomId: string, input: MatchInput) {
    if (isNeonApiEnabled) { await neonApi.addMatch(roomId, input, requireToken(roomId)); return }
    const room = await this.loadRoom(roomId)
    const matchId = uid()
    const createdAt = new Date().toISOString()
    room.matches.push({ id: matchId, room_id: roomId, title: input.title, game_number: null, played_at: input.playedAt, created_at: createdAt })
    room.scores.push(...input.scores.map((item) => ({
      id: uid(), room_id: roomId, match_id: matchId, player_id: item.playerId, score: item.score, created_at: createdAt,
    })))
    saveDemoRoom(room)
  },

  async importResult(roomId: string, input: ImportResultInput) {
    if (isNeonApiEnabled) { await neonApi.importResult(roomId, input, requireToken(roomId)); return }
    const room = await this.loadRoom(roomId)
    const createdAt = new Date().toISOString()
    let match = room.matches.find((item) => item.game_number === input.gameNumber)
    if (!match) {
      match = {
        id: uid(), room_id: roomId, title: `TimeGuessr #${input.gameNumber}`,
        game_number: input.gameNumber, played_at: input.playedAt, created_at: createdAt,
      }
      room.matches.push(match)
    }
    const currentScore = room.scores.find((item) => item.match_id === match.id && item.player_id === input.playerId)
    if (currentScore) currentScore.score = input.totalScore
    else room.scores.push({
      id: uid(), room_id: roomId, match_id: match.id, player_id: input.playerId,
      score: input.totalScore, created_at: createdAt,
    })
    room.rounds = room.rounds.filter((item) => item.match_id !== match.id || item.player_id !== input.playerId)
    room.rounds.push(...input.rounds.map((round) => ({
      id: uid(), room_id: roomId, match_id: match!.id, player_id: input.playerId,
      round_number: round.roundNumber, round_score: round.roundScore,
      year_error: round.yearError, distance_km: round.distanceKm, created_at: createdAt,
    })))
    saveDemoRoom(room)
  },

  async updateMatch(match: GameMatch, input: MatchUpdateInput) {
    if (isNeonApiEnabled) { await neonApi.updateMatch(match.room_id, match.id, input, requireToken(match.room_id)); return }
    const room = await this.loadRoom(match.room_id)
    room.matches = room.matches.map((item) => item.id === match.id
      ? { ...item, title: input.title, played_at: input.playedAt }
      : item)
    saveDemoRoom(room)
  },

  async deleteMatch(roomId: string, matchId: string) {
    if (isNeonApiEnabled) { await neonApi.deleteMatch(roomId, matchId, requireToken(roomId)); return }
    const room = await this.loadRoom(roomId)
    room.matches = room.matches.filter((item) => item.id !== matchId)
    room.scores = room.scores.filter((item) => item.match_id !== matchId)
    room.rounds = room.rounds.filter((item) => item.match_id !== matchId)
    saveDemoRoom(room)
  },

  subscribe(_roomId: string, onChange: () => void) {
    if (isNeonApiEnabled) {
      const refresh = () => { if (navigator.onLine && document.visibilityState === 'visible') onChange() }
      const timer = window.setInterval(refresh, 7000)
      window.addEventListener('online', refresh)
      document.addEventListener('visibilitychange', refresh)
      return () => {
        window.clearInterval(timer)
        window.removeEventListener('online', refresh)
        document.removeEventListener('visibilitychange', refresh)
      }
    }
    const handler = () => onChange()
    window.addEventListener('storage', handler)
    window.addEventListener('cronorank:local-change', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('cronorank:local-change', handler)
    }
  },
}
