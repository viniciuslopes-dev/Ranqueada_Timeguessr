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
})
