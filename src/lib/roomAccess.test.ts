import { beforeEach, describe, expect, it } from 'vitest'
import {
  describeSavedAt,
  forgetRoom,
  readAccessToken,
  readActiveRoomId,
  readCachedRoom,
  saveAccessToken,
  saveActiveRoomId,
  saveCachedRoom,
  touchCachedRoom,
} from './roomAccess'
import type { RoomSnapshot } from '../types'

// localStorage de mentira: as chaves ficam como propriedades enumeraveis do
// objeto, igual ao navegador, para que a limpeza por Object.keys funcione.
function createStorage(limitBytes = Number.POSITIVE_INFINITY) {
  const store: Record<string, unknown> = {}
  const method = (value: unknown) => ({ value, enumerable: false, writable: true })
  const used = () => Object.keys(store).reduce((total, key) => total + String(store[key]).length, 0)
  const writes: string[] = []
  Object.defineProperties(store, {
    getItem: method((key: string) => (typeof store[key] === 'string' ? store[key] : null)),
    setItem: method((key: string, value: string) => {
      const previous = typeof store[key] === 'string' ? String(store[key]).length : 0
      if (used() - previous + value.length > limitBytes) throw new Error('QuotaExceededError')
      store[key] = value
      writes.push(key)
    }),
    removeItem: method((key: string) => { delete store[key] }),
    writes: method(writes),
  })
  return store as Record<string, unknown> & Storage & { writes: string[] }
}

const snapshotFor = (roomId: string, name = 'Liga dos Crononautas'): RoomSnapshot => ({
  room: { id: roomId, name, invite_code: 'ABC234', created_at: '2026-09-01T12:00:00.000Z' },
  players: [{ id: 'p1', room_id: roomId, nickname: 'Lia', color: '#ff7043', created_at: '2026-09-01T12:00:00.000Z' }],
  matches: [{ id: 'm1', room_id: roomId, title: 'TimeGuessr #1191', game_number: 1191, played_at: '2026-09-17', created_at: '2026-09-17T23:00:00.000Z' }],
  scores: [{ id: 's1', room_id: roomId, match_id: 'm1', player_id: 'p1', score: 42180, created_at: '2026-09-17T23:00:00.000Z' }],
  rounds: [],
})

describe('acesso guardado da liga', () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage()
  })

  it('devolve o ranking salvo com a data da sincronização', () => {
    saveCachedRoom('room-1', snapshotFor('room-1'), '2026-09-18T20:30:00.000Z')
    const cached = readCachedRoom('room-1')
    expect(cached?.savedAt).toBe('2026-09-18T20:30:00.000Z')
    expect(cached?.snapshot.room.name).toBe('Liga dos Crononautas')
    expect(cached?.snapshot.scores).toHaveLength(1)
  })

  it('não devolve nada quando ainda não houve sincronização', () => {
    expect(readCachedRoom('room-1')).toBeNull()
  })

  it('descarta uma cópia corrompida em vez de quebrar a abertura', () => {
    localStorage.setItem('cronorank:room-cache:room-1', '{isso não é json')
    expect(readCachedRoom('room-1')).toBeNull()
    expect(localStorage.getItem('cronorank:room-cache:room-1')).toBeNull()
  })

  it('mantém o token entre aberturas do app', () => {
    saveAccessToken('room-1', 'token-secreto')
    saveActiveRoomId('room-1')
    expect(readAccessToken('room-1')).toBe('token-secreto')
    expect(readActiveRoomId()).toBe('room-1')
  })

  it('só apaga token, cópia e liga ativa quando o acesso é abandonado', () => {
    saveAccessToken('room-1', 'token-secreto')
    saveActiveRoomId('room-1')
    saveCachedRoom('room-1', snapshotFor('room-1'))

    forgetRoom('room-1')

    expect(readAccessToken('room-1')).toBeNull()
    expect(readCachedRoom('room-1')).toBeNull()
    expect(readActiveRoomId()).toBeNull()
  })

  it('não reescreve o ranking inteiro quando nada mudou', () => {
    const storage = createStorage()
    globalThis.localStorage = storage
    saveCachedRoom('room-throttle', snapshotFor('room-throttle'), '2026-09-18T20:00:00.000Z')
    saveCachedRoom('room-throttle', snapshotFor('room-throttle'), '2026-09-18T20:00:07.000Z')

    // a copia pesada vai ao disco uma vez; so o carimbo de hora se repete
    expect(storage.writes.filter((key) => key === 'cronorank:room-cache:room-throttle')).toHaveLength(1)
    expect(readCachedRoom('room-throttle')?.savedAt).toBe('2026-09-18T20:00:07.000Z')

    saveCachedRoom('room-throttle', snapshotFor('room-throttle', 'Liga renomeada'), '2026-09-18T20:00:14.000Z')
    expect(storage.writes.filter((key) => key === 'cronorank:room-cache:room-throttle')).toHaveLength(2)
    expect(readCachedRoom('room-throttle')?.snapshot.room.name).toBe('Liga renomeada')
  })

  it('consulta sem mudanças só avança a hora da sincronização', () => {
    const storage = createStorage()
    globalThis.localStorage = storage
    saveCachedRoom('room-1', snapshotFor('room-1'), '2026-09-18T20:00:00.000Z')
    touchCachedRoom('room-1', '2026-09-18T20:00:07.000Z')

    expect(storage.writes.filter((key) => key === 'cronorank:room-cache:room-1')).toHaveLength(1)
    expect(readCachedRoom('room-1')?.savedAt).toBe('2026-09-18T20:00:07.000Z')

    // sem copia salva nao ha o que datar: nada e gravado
    touchCachedRoom('room-2', '2026-09-18T20:00:07.000Z')
    expect(localStorage.getItem('cronorank:room-synced:room-2')).toBeNull()
  })

  it('libera espaço das outras ligas quando a cota estoura', () => {
    const entry = JSON.stringify({ version: 1, snapshot: snapshotFor('room-antiga') })
    globalThis.localStorage = createStorage(entry.length + 60)
    saveCachedRoom('room-antiga', snapshotFor('room-antiga'))
    expect(readCachedRoom('room-antiga')).not.toBeNull()

    saveCachedRoom('room-nova', snapshotFor('room-nova', 'Liga Nova'))

    expect(readCachedRoom('room-antiga')).toBeNull()
    expect(readCachedRoom('room-nova')?.snapshot.room.name).toBe('Liga Nova')
  })

  it('não guarda nada quando o armazenamento está bloqueado', () => {
    const blocked = {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('bloqueado') },
      removeItem: () => { throw new Error('bloqueado') },
    }
    globalThis.localStorage = blocked as unknown as Storage
    expect(() => saveCachedRoom('room-1', snapshotFor('room-1'))).not.toThrow()
    expect(readCachedRoom('room-1')).toBeNull()
    expect(readActiveRoomId()).toBeNull()
  })
})

describe('descrição da última sincronização', () => {
  const now = new Date('2026-09-18T20:00:00.000Z')
  const minutesBefore = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString()

  it('resume o tempo desde a última carga', () => {
    expect(describeSavedAt(minutesBefore(1), now)).toBe('de agora há pouco')
    expect(describeSavedAt(minutesBefore(25), now)).toBe('de 25 min atrás')
    expect(describeSavedAt(minutesBefore(60), now)).toBe('de 1 hora atrás')
    expect(describeSavedAt(minutesBefore(60 * 5), now)).toBe('de 5 horas atrás')
    expect(describeSavedAt(minutesBefore(60 * 26), now)).toBe('de ontem')
    expect(describeSavedAt(minutesBefore(60 * 24 * 4), now)).toBe('de 4 dias atrás')
  })

  it('aguenta uma data inválida', () => {
    expect(describeSavedAt('não é data', now)).toBe('da última sincronização')
  })
})
