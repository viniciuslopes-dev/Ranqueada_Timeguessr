import { randomBytes, randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

type Json = Record<string, unknown>
type RoomRow = { id: string; name: string; invite_code: string; access_token: string; created_at: string }
type Sql = NeonQueryFunction<false, false>

const colors = ['#ff7043', '#4f7cff', '#8b5cf6', '#23a982', '#e8a317', '#e75480', '#197f91', '#6f7d3c']
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let detailsSchemaReady: Promise<void> | undefined

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

const ensureDetailsSchema = (sql: Sql) => {
  detailsSchemaReady ??= (async () => {
    const state = await sql`
      select
        to_regclass('public.round_details') is not null as has_rounds,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'matches' and column_name = 'game_number'
        ) as has_game_number
    ` as Array<{ has_rounds: boolean; has_game_number: boolean }>
    if (state[0]?.has_rounds && state[0]?.has_game_number) return
    await sql`alter table matches add column if not exists game_number integer check (game_number > 0)`
    await sql`create unique index if not exists matches_room_game_number_unique on matches (room_id, game_number) where game_number is not null`
    await sql`
      create table if not exists round_details (
        id uuid primary key default gen_random_uuid(),
        room_id uuid not null references rooms(id) on delete cascade,
        match_id uuid not null references matches(id) on delete cascade,
        player_id uuid not null references players(id) on delete cascade,
        round_number smallint not null check (round_number between 1 and 5),
        round_score integer not null check (round_score between 0 and 10000),
        year_error integer not null check (year_error >= 0),
        distance_km numeric(12, 3) not null check (distance_km >= 0),
        created_at timestamptz not null default now(),
        unique (match_id, player_id, round_number),
        foreign key (match_id, player_id) references scores(match_id, player_id) on delete cascade
      )
    `
    await sql`create index if not exists round_details_room_idx on round_details(room_id)`
    await sql`create index if not exists round_details_player_idx on round_details(player_id)`
  })().catch((error) => {
    detailsSchemaReady = undefined
    throw error
  })
  return detailsSchemaReady
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
    await ensureDetailsSchema(sql)

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
      const [rooms, players, matches, scores, rounds] = await sql.transaction([
        sql`select id, name, invite_code, created_at from rooms where id = ${roomId}`,
        sql`select id, room_id, nickname, color, created_at from players where room_id = ${roomId} order by created_at`,
        sql`select id, room_id, title, game_number, played_at, created_at from matches where room_id = ${roomId} order by played_at desc, created_at desc`,
        sql`select id, room_id, match_id, player_id, score, created_at from scores where room_id = ${roomId}`,
        sql`select id, room_id, match_id, player_id, round_number, round_score, year_error, distance_km::float8 as distance_km, created_at from round_details where room_id = ${roomId}`,
      ], { readOnly: true, isolationLevel: 'RepeatableRead' })
      if (!rooms[0]) throw new HttpError(404, 'Liga não encontrada.')
      return json({ room: rooms[0], players, matches, scores, rounds })
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

    if (action === 'import_result') {
      const playerId = uuid(body.playerId, 'Jogador')
      const playedAt = text(body.playedAt, 'Data', 10, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) throw new HttpError(400, 'Data inválida.')
      const gameNumber = Number(body.gameNumber)
      const totalScore = Number(body.totalScore)
      if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 1000000000) throw new HttpError(400, 'Número do TimeGuessr inválido.')
      if (!Number.isInteger(totalScore) || totalScore < 0 || totalScore > 50000) throw new HttpError(400, 'Pontuação total inválida.')
      if (!Array.isArray(body.rounds) || body.rounds.length !== 5) throw new HttpError(400, 'O resultado deve ter cinco rodadas.')
      const rounds = body.rounds.map((item) => {
        if (!item || typeof item !== 'object') throw new HttpError(400, 'Rodada inválida.')
        const entry = item as Json
        const roundNumber = Number(entry.roundNumber)
        const roundScore = Number(entry.roundScore)
        const yearError = Number(entry.yearError)
        const distanceKm = Number(entry.distanceKm)
        if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 5) throw new HttpError(400, 'Número da rodada inválido.')
        if (!Number.isInteger(roundScore) || roundScore < 0 || roundScore > 10000) throw new HttpError(400, 'Pontuação da rodada inválida.')
        if (!Number.isInteger(yearError) || yearError < 0 || yearError > 10000) throw new HttpError(400, 'Diferença de ano inválida.')
        if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 50000) throw new HttpError(400, 'Distância da rodada inválida.')
        return { roundNumber, roundScore, yearError, distanceKm }
      })
      if (new Set(rounds.map((round) => round.roundNumber)).size !== 5) throw new HttpError(400, 'Há rodadas repetidas no resultado.')
      if (rounds.reduce((sum, round) => sum + round.roundScore, 0) !== totalScore) throw new HttpError(400, 'A soma das rodadas não confere com o total.')
      const players = await sql`select id from players where id = ${playerId} and room_id = ${roomId} limit 1`
      if (!players.length) throw new HttpError(404, 'Jogador não encontrado nesta liga.')

      const existing = await sql`select id from matches where room_id = ${roomId} and game_number = ${gameNumber} limit 1`
      const proposedMatchId = randomUUID()
      await sql.transaction([
        sql`
          insert into matches (id, room_id, title, game_number, played_at)
          values (${proposedMatchId}, ${roomId}, ${`TimeGuessr #${gameNumber}`}, ${gameNumber}, ${playedAt})
          on conflict (room_id, game_number) where game_number is not null do nothing
        `,
        sql`
          insert into scores (id, room_id, match_id, player_id, score)
          select ${randomUUID()}, ${roomId}, id, ${playerId}, ${totalScore}
          from matches where room_id = ${roomId} and game_number = ${gameNumber}
          on conflict (match_id, player_id) do update set score = excluded.score
        `,
        ...rounds.map((round) => sql`
          insert into round_details (id, room_id, match_id, player_id, round_number, round_score, year_error, distance_km)
          select ${randomUUID()}, ${roomId}, id, ${playerId}, ${round.roundNumber}, ${round.roundScore}, ${round.yearError}, ${round.distanceKm}
          from matches where room_id = ${roomId} and game_number = ${gameNumber}
          on conflict (match_id, player_id, round_number) do update set
            round_score = excluded.round_score,
            year_error = excluded.year_error,
            distance_km = excluded.distance_km
        `),
      ])
      const matches = await sql`select id from matches where room_id = ${roomId} and game_number = ${gameNumber} limit 1`
      return json({ ok: true, matchId: matches[0].id, created: existing.length === 0 }, existing.length ? 200 : 201)
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
