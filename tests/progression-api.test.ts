import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const db = vi.hoisted(() => ({
  queries: [] as Array<{ query: string; values: unknown[] }>,
  resolver: (_query: string, _values: unknown[]): unknown[] => [],
}))
vi.mock('@neondatabase/serverless', () => {
  const sql = (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?').replace(/\s+/g, ' ').trim()
    db.queries.push({ query, values })
    return Promise.resolve(db.resolver(query, values))
  }
  sql.transaction = (queries: Promise<unknown[]>[]) => Promise.all(queries)
  return { neon: () => sql }
})
import handler from '../netlify/functions/api.mts'
import { loadProgressSnapshot } from '../netlify/lib/progression'
import { neon } from '@neondatabase/serverless'
import { emptyProgress } from '../src/lib/progression'

const roomId = '00000000-0000-4000-8000-000000000001'
const playerId = '00000000-0000-4000-8000-000000000002'
const matchId = '00000000-0000-4000-8000-000000000003'
const roomRow = { id: roomId, name: 'Teste', invite_code: 'ABCDEF', created_at: '' }
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

// O Postgres devolve jsonb com as chaves ordenadas por tamanho e depois por
// bytes, nunca na ordem em que o JavaScript montou o objeto.
const jsonbRoundtrip = (value: unknown): unknown => {
  const reorder = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(reorder)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
              .map(([key, entry]) => [key, reorder(entry)]),
          )
        : item
  return reorder(JSON.parse(JSON.stringify(value)))
}

// Dois jogadores e dois dias disputados numa semana já encerrada: o bastante
// para existir temporada premiada e conquistas no estado salvo.
const closedWeek = () => {
  const players = ['Lia', 'Caio'].map((nickname, index) => ({
    id: `00000000-0000-4000-8000-00000000010${index}`,
    room_id: roomId,
    nickname,
    color: '#ff7043',
    created_at: '2020-01-01T00:00:00Z',
    archived: false,
  }))
  const matches = ['2020-01-06', '2020-01-07'].map((day, index) => ({
    id: `m${index}`,
    room_id: roomId,
    title: `TimeGuessr #${100 + index}`,
    game_number: 100 + index,
    played_at: day,
    created_at: `${day}T12:00:00Z`,
  }))
  const scores = matches.flatMap((match, matchIndex) =>
    players.map((player, index) => ({
      id: `s${matchIndex}${index}`,
      room_id: roomId,
      match_id: match.id,
      player_id: player.id,
      score: index === 0 ? 40000 : 30000,
      created_at: match.created_at,
    })),
  )
  return { players, matches, scores }
}
const original = process.env.DATABASE_URL
const request = (body: Record<string, unknown>) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'x'.repeat(43)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, ...body }),
  })
beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://test@localhost/test'
  db.queries = []
  db.resolver = (query) => {
    if (query.includes("to_regclass('public.round_details')")) return [{ has_rounds: true, has_game_number: true }]
    if (query.startsWith('select id from rooms')) return [{ id: roomId }]
    return []
  }
})
afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original
})

describe('proteções da competição na API', () => {
  it('recusa correção antiga sem motivo antes de gravar partida', async () => {
    const response = await handler(
      request({ action: 'add_match', title: 'Antiga', playedAt: '2020-01-01', scores: [{ playerId, score: 40000 }] }),
    )
    expect(response.status, JSON.stringify(await response.json())).toBe(409)
    expect(db.queries.some((q) => q.query.startsWith('insert into matches'))).toBe(false)
  })
  it('recusa datas impossíveis e datas futuras', async () => {
    for (const playedAt of ['2026-02-30', '2999-01-01']) {
      const response = await handler(
        request({ action: 'add_match', title: 'Daily', playedAt, scores: [{ playerId, score: 40000 }] }),
      )
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('data válida') })
    }
  })
  it('uma chave de perfil inválida não revoga o acesso da sala', async () => {
    const response = await handler(
      request({
        action: 'progress_command',
        playerId,
        profileToken: 'invalid',
        command: { type: 'challenge', opponentId: playerId },
      }),
    )
    expect(response.status).toBe(409)
  })
  it('não permite tomar um perfil já vinculado', async () => {
    const response = await handler(request({ action: 'claim_profile', playerId }))
    expect(response.status).toBe(409)
    expect(db.queries.some((q) => q.query.startsWith('update player_identity'))).toBe(false)
  })
  it('recupera perfil somente conferindo hash da chave', async () => {
    const profileToken = 's'.repeat(43)
    const base = db.resolver
    db.resolver = (query, values) =>
      query.startsWith('select i.player_id') && values[2] === createHash('sha256').update(profileToken).digest('hex')
        ? [{ player_id: playerId }]
        : base(query, values)
    const response = await handler(request({ action: 'claim_profile', playerId, profileToken }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ playerId, profileToken })
  })
  it('arquiva jogador sem excluir placares ou troféus', async () => {
    const base = db.resolver
    db.resolver = (query, values) =>
      query.startsWith('update players set archived') ? [{ id: playerId }] : base(query, values)
    const response = await handler(request({ action: 'delete_player', playerId }))
    expect(response.status).toBe(200)
    expect(db.queries.some((q) => q.query.startsWith('delete'))).toBe(false)
    expect(db.queries.some((q) => q.query.startsWith('insert into competition_audit'))).toBe(true)
  })
  it('excluir partida antiga exige motivo e grava auditoria com revisão', async () => {
    const base = db.resolver
    db.resolver = (query, values) => {
      if (query.startsWith('select played_at')) return [{ played_at: '2020-01-01' }]
      if (query.startsWith('delete from matches')) return [{ id: matchId }]
      return base(query, values)
    }
    expect((await handler(request({ action: 'delete_match', matchId }))).status).toBe(409)
    expect(
      (await handler(request({ action: 'delete_match', matchId, correctionReason: 'Partida duplicada' }))).status,
    ).toBe(200)
    const audit = db.queries.find((q) => q.query.startsWith('insert into competition_audit'))!
    expect(JSON.parse(audit.values[2] as string)).toMatchObject({
      matchId,
      previousDate: '2020-01-01',
      reason: 'Partida duplicada',
    })
    expect(db.queries.some((q) => q.query.includes('revision = room_progress.revision + 1'))).toBe(true)
  })
  it('repete leitura quando outra atualização vence a gravação por revisão', async () => {
    let updates = 0,
      reads = 0
    db.resolver = (query) => {
      if (query.startsWith('select id, name, invite_code'))
        return [{ id: roomId, name: 'Teste', invite_code: 'ABCDEF', created_at: '' }]
      if (query.startsWith('select revision, state')) {
        reads++
        return [{ revision: reads, state: {} }]
      }
      if (query.startsWith('update room_progress')) {
        updates++
        return updates === 1 ? [] : [{ revision: 3 }]
      }
      return []
    }
    const snapshot = await loadProgressSnapshot(neon('postgresql://test@localhost/test'), roomId)
    expect(reads).toBe(2)
    expect(snapshot.progress).toEqual(emptyProgress())
  })
  it('não regrava o estado nem revisa semanas quando o jsonb volta com as chaves reordenadas', async () => {
    const { players, matches, scores } = closedWeek()
    let stored: { revision: number; state: unknown } = { revision: 0, state: {} }
    let updates = 0
    db.resolver = (query, values) => {
      if (query.startsWith('select id, name, invite_code')) return [roomRow]
      if (query.includes('from players')) return players
      if (query.includes('from matches')) return matches
      if (query.includes('from scores')) return scores
      if (query.startsWith('select revision, state'))
        return [{ revision: stored.revision, state: jsonbRoundtrip(stored.state) }]
      if (query.startsWith('update room_progress')) {
        updates++
        stored = { revision: stored.revision + 1, state: JSON.parse(values[0] as string) }
        return [{ revision: stored.revision }]
      }
      return []
    }
    const sql = neon('postgresql://test@localhost/test')
    const first = await loadProgressSnapshot(sql, roomId)
    expect(updates).toBe(1)
    expect(first.revision).toBe(1)
    expect(first.progress!.seasons).toHaveLength(1)

    // cada consulta automática lê o estado reordenado de volta
    for (let poll = 0; poll < 3; poll++) {
      const again = await loadProgressSnapshot(sql, roomId)
      expect(again.revision).toBe(1)
      expect(again.progress!.seasons[0].revision).toBe(1)
      expect(again.progress!.seasons[0].correctedAt).toBeUndefined()
    }
    expect(updates).toBe(1)
  })
})

describe('consulta automática pela revisão', () => {
  it('sem mudanças, responde só a revisão', async () => {
    const base = db.resolver
    db.resolver = (query, values) =>
      query.startsWith('select revision from room_progress') ? [{ revision: 7 }] : base(query, values)
    const response = await handler(request({ action: 'load_room', knownRevision: 7 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ unchanged: true, revision: 7 })
    expect(db.queries.some((q) => q.query.startsWith('select revision, state'))).toBe(false)
  })
  it('com revisão nova, devolve a liga inteira e o número atual', async () => {
    const base = db.resolver
    db.resolver = (query, values) => {
      if (query.startsWith('select revision from room_progress')) return [{ revision: 8 }]
      if (query.startsWith('select id, name, invite_code')) return [roomRow]
      if (query.startsWith('select revision, state')) return [{ revision: 8, state: emptyProgress() }]
      return base(query, values)
    }
    const response = await handler(request({ action: 'load_room', knownRevision: 7 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ revision: 8, room: { id: roomId } })
  })
  it('cadastrar jogador avança a revisão para as outras telas', async () => {
    const response = await handler(request({ action: 'add_player', nickname: 'Novo', color: '#ff7043' }))
    expect(response.status).toBe(201)
    expect(db.queries.some((q) => q.query.includes('revision = room_progress.revision + 1'))).toBe(true)
  })
})

describe('vínculo automático do perfil', () => {
  const joining = (claimed: boolean) => {
    const base = db.resolver
    db.resolver = (query, values) => {
      if (query.startsWith('select id, access_token from rooms')) return [{ id: roomId, access_token: 'x'.repeat(43) }]
      if (query.startsWith('select id from players where room_id')) return [{ id: playerId }]
      if (query.startsWith('insert into player_identity')) return claimed ? [] : [{ player_id: playerId }]
      return base(query, values)
    }
  }
  it('quem cria a liga sai com o próprio perfil vinculado', async () => {
    const response = await handler(request({ action: 'create_room', name: 'Liga', nickname: 'Lia' }))
    expect(response.status).toBe(201)
    const body = (await response.json()) as { playerId: string; profileToken: string }
    const identity = db.queries.find((q) => q.query.startsWith('insert into player_identity'))!
    expect(identity.values).toEqual([body.playerId, expect.any(String), sha256(body.profileToken)])
  })
  it('entrar com o próprio nick vincula o perfil livre a este aparelho', async () => {
    joining(false)
    const response = await handler(request({ action: 'join_room', code: 'ABCDEF', nickname: 'Lia' }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { playerId: string; profileToken: string }
    expect(body).toMatchObject({ roomId, playerId, profileToken: expect.any(String) })
    expect(db.queries.find((q) => q.query.startsWith('insert into player_identity'))!.values).toContain(
      sha256(body.profileToken),
    )
  })
  it('nick com perfil vinculado em outro aparelho entra sem receber a chave', async () => {
    joining(true)
    const response = await handler(request({ action: 'join_room', code: 'ABCDEF', nickname: 'Lia' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ roomId, playerId })
    expect(body).not.toHaveProperty('profileToken')
  })
})
