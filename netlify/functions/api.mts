import { randomBytes, randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

type Json = Record<string, unknown>
type RoomRow = { id: string; name: string; invite_code: string; access_token: string; created_at: string }

const colors = ['#ff7043', '#4f7cff', '#8b5cf6', '#23a982', '#e8a317', '#e75480', '#197f91', '#6f7d3c']
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const json = (body: Json, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})

const text = (value: unknown, label: string, min: number, max: number) => {
  if (typeof value !== 'string') throw new HttpError(400, `${label} inválido.`)
  const clean = value.trim()
  if (clean.length < min || clean.length > max) throw new HttpError(400, `${label} deve ter entre ${min} e ${max} caracteres.`)
  return clean
}

const uuid = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new HttpError(400, `${label} inválido.`)
  return value
}

const makeCode = () => Array.from(randomBytes(6), (value) => codeAlphabet[value % codeAlphabet.length]).join('')
const bearer = (request: Request) => {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ') || header.length < 40) throw new HttpError(401, 'Acesso à liga não encontrado.')
  return header.slice(7)
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  if (Number(request.headers.get('content-length') || 0) > 30000) return json({ error: 'Requisição muito grande.' }, 413)
  if (!process.env.DATABASE_URL) return json({ error: 'DATABASE_URL ainda não foi configurada na Netlify.' }, 503)

  const sql = neon(process.env.DATABASE_URL)
  try {
    const body = await request.json() as Json
    const action = body.action

    if (action === 'create_room') {
      const name = text(body.name, 'Nome da liga', 2, 40)
      const nickname = text(body.nickname, 'Nick', 1, 24)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const roomId = randomUUID()
        const playerId = randomUUID()
        const code = makeCode()
        const accessToken = randomBytes(32).toString('base64url')
        try {
          await sql.transaction([
            sql`insert into rooms (id, name, invite_code, access_token) values (${roomId}, ${name}, ${code}, ${accessToken})`,
            sql`insert into players (id, room_id, nickname, color) values (${playerId}, ${roomId}, ${nickname}, '#ff7043')`,
          ])
          return json({ roomId, code, accessToken }, 201)
        } catch (error) {
          if (!String(error).toLowerCase().includes('invite_code')) throw error
        }
      }
      throw new HttpError(503, 'Não foi possível gerar o código da liga. Tente novamente.')
    }

    if (action === 'join_room') {
      const code = text(body.code, 'Código', 6, 6).toUpperCase()
      const nickname = text(body.nickname, 'Nick', 1, 24)
      const rooms = await sql`select id, access_token from rooms where invite_code = ${code} limit 1` as Array<Pick<RoomRow, 'id' | 'access_token'>>
      const room = rooms[0]
      if (!room) throw new HttpError(404, 'Não encontramos essa liga. Confira o código.')
      await sql`
        insert into players (id, room_id, nickname, color)
        values (${randomUUID()}, ${room.id}, ${nickname}, ${colors[randomBytes(1)[0] % colors.length]})
        on conflict do nothing
      `
      return json({ roomId: room.id, accessToken: room.access_token })
    }

    const token = bearer(request)
    const roomId = uuid(body.roomId, 'Sala')
    const authorized = await sql`select id from rooms where id = ${roomId} and access_token = ${token} limit 1`
    if (!authorized.length) throw new HttpError(403, 'O convite desta liga não é mais válido.')

    if (action === 'load_room') {
      const [rooms, players, matches, scores] = await sql.transaction([
        sql`select id, name, invite_code, created_at from rooms where id = ${roomId}`,
        sql`select id, room_id, nickname, color, created_at from players where room_id = ${roomId} order by created_at`,
        sql`select id, room_id, title, played_at, created_at from matches where room_id = ${roomId} order by played_at desc, created_at desc`,
        sql`select id, room_id, match_id, player_id, score, created_at from scores where room_id = ${roomId}`,
      ], { readOnly: true, isolationLevel: 'RepeatableRead' })
      if (!rooms[0]) throw new HttpError(404, 'Liga não encontrada.')
      return json({ room: rooms[0], players, matches, scores })
    }

    if (action === 'add_player') {
      const nickname = text(body.nickname, 'Nick', 1, 24)
      const color = text(body.color, 'Cor', 7, 7)
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, 'Cor inválida.')
      await sql`insert into players (id, room_id, nickname, color) values (${randomUUID()}, ${roomId}, ${nickname}, ${color})`
      return json({ ok: true }, 201)
    }

    if (action === 'update_player') {
      const playerId = uuid(body.playerId, 'Jogador')
      const nickname = text(body.nickname, 'Nick', 1, 24)
      const color = text(body.color, 'Cor', 7, 7)
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, 'Cor inválida.')
      const result = await sql`update players set nickname = ${nickname}, color = ${color} where id = ${playerId} and room_id = ${roomId} returning id`
      if (!result.length) throw new HttpError(404, 'Jogador não encontrado.')
      return json({ ok: true })
    }

    if (action === 'delete_player') {
      const playerId = uuid(body.playerId, 'Jogador')
      const result = await sql`delete from players where id = ${playerId} and room_id = ${roomId} returning id`
      if (!result.length) throw new HttpError(404, 'Jogador não encontrado.')
      return json({ ok: true })
    }

    if (action === 'add_match') {
      const title = text(body.title, 'Nome da partida', 1, 50)
      const playedAt = text(body.playedAt, 'Data', 10, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) throw new HttpError(400, 'Data inválida.')
      if (!Array.isArray(body.scores) || body.scores.length < 1 || body.scores.length > 100) throw new HttpError(400, 'Placares inválidos.')
      const scores = body.scores.map((item) => {
        if (!item || typeof item !== 'object') throw new HttpError(400, 'Placar inválido.')
        const entry = item as Json
        const playerId = uuid(entry.playerId, 'Jogador')
        const score = Number(entry.score)
        if (!Number.isInteger(score) || score < 0 || score > 50000) throw new HttpError(400, 'O placar deve estar entre 0 e 50.000.')
        return { playerId, score }
      })
      if (new Set(scores.map((item) => item.playerId)).size !== scores.length) throw new HttpError(400, 'Há jogadores repetidos nos placares.')
      const idsJson = JSON.stringify(scores.map((item) => item.playerId))
      const validPlayers = await sql`
        select id from players where room_id = ${roomId}
        and id in (select value::uuid from jsonb_array_elements_text(${idsJson}::jsonb))
      `
      if (validPlayers.length !== scores.length) throw new HttpError(400, 'Um dos jogadores não pertence a esta liga.')
      const matchId = randomUUID()
      await sql.transaction([
        sql`insert into matches (id, room_id, title, played_at) values (${matchId}, ${roomId}, ${title}, ${playedAt})`,
        ...scores.map((item) => sql`insert into scores (id, room_id, match_id, player_id, score) values (${randomUUID()}, ${roomId}, ${matchId}, ${item.playerId}, ${item.score})`),
      ])
      return json({ ok: true }, 201)
    }

    if (action === 'delete_match') {
      const matchId = uuid(body.matchId, 'Partida')
      const result = await sql`delete from matches where id = ${matchId} and room_id = ${roomId} returning id`
      if (!result.length) throw new HttpError(404, 'Partida não encontrada.')
      return json({ ok: true })
    }

    throw new HttpError(400, 'Ação desconhecida.')
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (String(error).toLowerCase().includes('unique')) return json({ error: 'Esse nick já está na liga.' }, 409)
    console.error('CronoRank API error:', error)
    return json({ error: 'O banco não conseguiu concluir a operação.' }, 500)
  }
}
