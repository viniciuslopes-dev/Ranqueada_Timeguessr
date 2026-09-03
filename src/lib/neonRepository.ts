import type { MatchInput, Player, RoomSnapshot } from '../types'
import { isNeonApiEnabled, neonApi } from './api'

const DEMO_STORAGE_KEY = 'cronorank:demo-data:v1'
const DEMO_ROOM_ID = 'demo-room'
const TOKEN_PREFIX = 'cronorank:room-token:'
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}
const uid = () => crypto.randomUUID()
const tokenKey = (roomId: string) => `${TOKEN_PREFIX}${roomId}`

function requireToken(roomId: string): string {
  const token = localStorage.getItem(tokenKey(roomId))
  if (!token) throw new Error('Acesso à liga não encontrado. Entre novamente usando o código.')
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
    { id: 'demo-match-1', room_id: DEMO_ROOM_ID, title: 'Daily #1189', played_at: daysAgo(6), created_at: new Date().toISOString() },
    { id: 'demo-match-2', room_id: DEMO_ROOM_ID, title: 'Daily #1190', played_at: daysAgo(4), created_at: new Date().toISOString() },
    { id: 'demo-match-3', room_id: DEMO_ROOM_ID, title: 'Sextou pelo mundo', played_at: daysAgo(2), created_at: new Date().toISOString() },
    { id: 'demo-match-4', room_id: DEMO_ROOM_ID, title: 'Daily de hoje', played_at: today(), created_at: new Date().toISOString() },
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

  async loadRoom(roomId: string): Promise<RoomSnapshot> {
    if (isNeonApiEnabled) return neonApi.loadRoom(roomId, requireToken(roomId))
    const snapshot = getDemoData()[roomId]
    if (!snapshot) throw new Error('Sala não encontrada neste aparelho.')
    return structuredClone(snapshot)
  },

  async createRoom(name: string, nickname: string): Promise<{ roomId: string; code: string }> {
    if (isNeonApiEnabled) {
      const result = await neonApi.createRoom(name, nickname)
      localStorage.setItem(tokenKey(result.roomId), result.accessToken)
      return { roomId: result.roomId, code: result.code! }
    }
    const roomId = uid()
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    saveDemoRoom({
      room: { id: roomId, name, invite_code: code, created_at: new Date().toISOString() },
      players: [{ id: uid(), room_id: roomId, nickname, color: '#ff7043', created_at: new Date().toISOString() }],
      matches: [], scores: [],
    })
    return { roomId, code }
  },

  async joinRoom(code: string, nickname: string): Promise<{ roomId: string }> {
    if (isNeonApiEnabled) {
      const result = await neonApi.joinRoom(code.toUpperCase(), nickname)
      localStorage.setItem(tokenKey(result.roomId), result.accessToken)
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
    saveDemoRoom(room)
  },

  async addMatch(roomId: string, input: MatchInput) {
    if (isNeonApiEnabled) { await neonApi.addMatch(roomId, input, requireToken(roomId)); return }
    const room = await this.loadRoom(roomId)
    const matchId = uid()
    const createdAt = new Date().toISOString()
    room.matches.push({ id: matchId, room_id: roomId, title: input.title, played_at: input.playedAt, created_at: createdAt })
    room.scores.push(...input.scores.map((item) => ({
      id: uid(), room_id: roomId, match_id: matchId, player_id: item.playerId, score: item.score, created_at: createdAt,
    })))
    saveDemoRoom(room)
  },

  async deleteMatch(roomId: string, matchId: string) {
    if (isNeonApiEnabled) { await neonApi.deleteMatch(roomId, matchId, requireToken(roomId)); return }
    const room = await this.loadRoom(roomId)
    room.matches = room.matches.filter((item) => item.id !== matchId)
    room.scores = room.scores.filter((item) => item.match_id !== matchId)
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
