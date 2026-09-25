import { createHash, randomBytes } from 'node:crypto'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type { RoomSnapshot } from '../../src/types'
import {
  applyProgressCommand,
  decoratePlayers,
  emptyProgress,
  reconcileProgress,
  sameJson,
  type ProgressCommand,
  type ProgressState,
} from '../../src/lib/progression'

type Sql = NeonQueryFunction<false, false>
let ready: Promise<void> | undefined
export const ensureProgressSchema = (sql: Sql) => {
  ready ??= (async () => {
    await sql`alter table players add column if not exists archived boolean not null default false`
    await sql`create table if not exists room_progress (room_id uuid primary key references rooms(id) on delete cascade, revision integer not null default 0, state jsonb not null default '{}'::jsonb)`
    await sql`create table if not exists player_identity (player_id uuid primary key references players(id) on delete cascade, room_id uuid not null references rooms(id) on delete cascade, token_hash text not null, created_at timestamptz not null default now())`
    await sql`create table if not exists competition_audit (id bigint generated always as identity primary key, room_id uuid not null references rooms(id) on delete cascade, action text not null, detail jsonb not null, created_at timestamptz not null default now())`
  })().catch((error) => {
    ready = undefined
    throw error
  })
  return ready
}

export const hashProfileToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function verifyIdentity(sql: Sql, roomId: string, playerId: string, token: unknown) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return false
  const rows =
    await sql`select i.player_id from player_identity i join players p on p.id = i.player_id where i.room_id = ${roomId} and i.player_id = ${playerId} and i.token_hash = ${hashProfileToken(token)} and not p.archived`
  return rows.length > 0
}

// Vincula a este aparelho um perfil ainda livre. Devolve null quando outro
// aparelho já guardou a chave desse jogador ou quando ele está arquivado.
export async function tryClaimIdentity(sql: Sql, roomId: string, playerId: string): Promise<string | null> {
  const token = randomBytes(32).toString('base64url')
  const [claimed] = await sql.transaction([
    sql`insert into player_identity (player_id, room_id, token_hash) select id, room_id, ${hashProfileToken(token)} from players where id = ${playerId} and room_id = ${roomId} and not archived on conflict do nothing returning player_id`,
    touchRoom(sql, roomId),
  ])
  return claimed.length ? token : null
}

export async function claimIdentity(sql: Sql, roomId: string, playerId: string, existingToken: unknown) {
  if (await verifyIdentity(sql, roomId, playerId, existingToken)) return existingToken as string
  const token = await tryClaimIdentity(sql, roomId, playerId)
  if (!token) throw new Error('Este perfil já está vinculado. Use a chave do perfil salva no outro aparelho.')
  return token
}

// A revisão é o "algo mudou" da liga: a consulta automática compara com ela e
// só baixa a liga inteira quando o número mudou. Toda gravação precisa passar aqui.
export const touchRoom = (sql: Sql, roomId: string) =>
  sql`insert into room_progress (room_id, revision) values (${roomId}, 1) on conflict (room_id) do update set revision = room_progress.revision + 1`

export async function currentRevision(sql: Sql, roomId: string): Promise<number | null> {
  const rows = (await sql`select revision from room_progress where room_id = ${roomId}`) as Array<{ revision: number }>
  return rows[0]?.revision ?? null
}

// Todos os escritores de partidas incrementam esta revisão na mesma transação.
// O CAS impede que uma leitura antiga sobrescreva prêmios ou preferências novas.
export async function loadProgressSnapshot(
  sql: Sql,
  roomId: string,
  actor?: string,
  command?: ProgressCommand,
): Promise<RoomSnapshot> {
  await sql`insert into room_progress (room_id) values (${roomId}) on conflict do nothing`
  for (let attempt = 0; attempt < 5; attempt++) {
    const [rooms, players, matches, scores, rounds, progress, claims] = await sql.transaction(
      [
        sql`select id, name, invite_code, created_at from rooms where id = ${roomId}`,
        sql`select id, room_id, nickname, color, created_at, archived from players where room_id = ${roomId} order by created_at`,
        sql`select id, room_id, title, game_number, played_at::text, created_at from matches where room_id = ${roomId} order by played_at desc, created_at desc`,
        sql`select id, room_id, match_id, player_id, score, created_at from scores where room_id = ${roomId}`,
        sql`select id, room_id, match_id, player_id, round_number, round_score, year_error, distance_km::float8 as distance_km, created_at from round_details where room_id = ${roomId}`,
        sql`select revision, state from room_progress where room_id = ${roomId}`,
        sql`select player_id from player_identity where room_id = ${roomId}`,
      ],
      { readOnly: true, isolationLevel: 'RepeatableRead' },
    )
    if (!rooms[0]) throw new Error('Liga não encontrada.')
    const record = progress[0] as { revision: number; state: ProgressState }
    const snapshot = {
      room: rooms[0],
      players,
      matches,
      scores,
      rounds,
      progress: record.state.version === 1 ? record.state : emptyProgress(),
      claimedPlayers: claims.map((c) => c.player_id),
    } as RoomSnapshot
    const next = command && actor ? applyProgressCommand(snapshot, actor, command) : reconcileProgress(snapshot)
    // sameJson ignora a ordem das chaves: o jsonb devolve o estado reordenado
    if (sameJson(next, record.state)) return decoratePlayers({ ...snapshot, progress: next, revision: record.revision })
    const updated =
      await sql`update room_progress set state = ${JSON.stringify(next)}::jsonb, revision = revision + 1 where room_id = ${roomId} and revision = ${record.revision} returning revision`
    if (updated.length) return decoratePlayers({ ...snapshot, progress: next, revision: Number(updated[0].revision) })
  }
  throw new Error('A liga recebeu várias atualizações. Tente novamente.')
}

export function competitionWrite(sql: Sql, roomId: string, action: string, detail: Record<string, unknown>) {
  return [
    touchRoom(sql, roomId),
    sql`insert into competition_audit (room_id, action, detail) values (${roomId}, ${action}, ${JSON.stringify(detail)}::jsonb)`,
  ]
}
