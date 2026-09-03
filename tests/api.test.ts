import { afterEach, describe, expect, it } from 'vitest'
import handler from '../netlify/functions/api.mts'

const originalDatabaseUrl = process.env.DATABASE_URL

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
})

describe('CronoRank Netlify Function', () => {
  it('rejeita métodos diferentes de POST', async () => {
    const response = await handler(new Request('http://localhost/api', { method: 'GET' }))
    expect(response.status).toBe(405)
  })

  it('explica quando o Neon ainda não foi configurado', async () => {
    delete process.env.DATABASE_URL
    const response = await handler(new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'load_room' }),
    }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('DATABASE_URL') })
  })
})
