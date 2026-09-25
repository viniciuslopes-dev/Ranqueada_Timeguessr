import type { RoomSnapshot } from '../types'

// Tudo que mantem a liga aberta entre aberturas do app mora aqui: o token de
// acesso, o id da liga ativa e a ultima copia do ranking. O objetivo e nunca
// mais pedir o codigo por causa de uma abertura sem internet — so quando o
// proprio servidor disser que aquele acesso nao vale mais.

const ACTIVE_ROOM_KEY = 'cronorank:active-room'
const TOKEN_PREFIX = 'cronorank:room-token:'
const CACHE_PREFIX = 'cronorank:room-cache:'
const SYNC_PREFIX = 'cronorank:room-synced:'
const CACHE_VERSION = 1

export type CachedRoom = { snapshot: RoomSnapshot; savedAt: string }
type CacheEntry = { version: number; snapshot: RoomSnapshot }

const tokenKey = (roomId: string) => `${TOKEN_PREFIX}${roomId}`
const cacheKey = (roomId: string) => `${CACHE_PREFIX}${roomId}`
const syncKey = (roomId: string) => `${SYNC_PREFIX}${roomId}`

// O ranking e recarregado a cada sete segundos; reescrever o JSON inteiro toda
// vez travaria a interface por nada. Guardamos o que ja foi gravado nesta
// sessao e so voltamos ao disco quando algo mudou de verdade.
const written = new Map<string, string>()

// Safari em aba privada e navegadores com armazenamento bloqueado lancam ao
// tocar no localStorage; nesses casos o app segue funcionando sem cache.
function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true } catch { return false }
}

function remove(key: string) {
  try { localStorage.removeItem(key) } catch { /* sem armazenamento, nada a limpar */ }
}

function keys(): string[] {
  try { return Object.keys(localStorage) } catch { return [] }
}

export const readActiveRoomId = () => read(ACTIVE_ROOM_KEY)
export const saveActiveRoomId = (roomId: string) => { write(ACTIVE_ROOM_KEY, roomId) }
export const readAccessToken = (roomId: string) => read(tokenKey(roomId))
export const saveAccessToken = (roomId: string, token: string) => { write(tokenKey(roomId), token) }

export function readCachedRoom(roomId: string): CachedRoom | null {
  const raw = read(cacheKey(roomId))
  if (!raw) return null
  try {
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.version !== CACHE_VERSION || !entry.snapshot?.room?.id) throw new Error('cache invalido')
    entry.snapshot.rounds ??= []
    return { snapshot: entry.snapshot, savedAt: read(syncKey(roomId)) ?? '' }
  } catch {
    remove(cacheKey(roomId))
    remove(syncKey(roomId))
    return null
  }
}

export function saveCachedRoom(roomId: string, snapshot: RoomSnapshot, savedAt = new Date().toISOString()) {
  write(syncKey(roomId), savedAt)
  const payload = JSON.stringify({ version: CACHE_VERSION, snapshot } satisfies CacheEntry)
  if (written.get(roomId) === payload) return
  if (write(cacheKey(roomId), payload)) {
    written.set(roomId, payload)
    return
  }
  // cota estourada: joga fora as copias das outras ligas e tenta uma vez mais
  pruneCaches(roomId)
  if (write(cacheKey(roomId), payload)) written.set(roomId, payload)
  else { remove(cacheKey(roomId)); written.delete(roomId) }
}

// A consulta automatica confirmou que nada mudou: a copia salva continua certa,
// so a hora da ultima sincronizacao avanca.
export function touchCachedRoom(roomId: string, savedAt = new Date().toISOString()) {
  if (read(cacheKey(roomId))) write(syncKey(roomId), savedAt)
}

// So o servidor dizendo "esse token nao vale mais" (ou o usuario saindo) apaga
// o acesso. Falha de rede nunca passa por aqui.
export function forgetRoom(roomId: string) {
  remove(tokenKey(roomId))
  remove(cacheKey(roomId))
  remove(syncKey(roomId))
  written.delete(roomId)
  if (read(ACTIVE_ROOM_KEY) === roomId) remove(ACTIVE_ROOM_KEY)
}

export function clearActiveRoom() {
  remove(ACTIVE_ROOM_KEY)
}

function pruneCaches(keepRoomId: string) {
  for (const key of keys()) {
    if (key.startsWith(CACHE_PREFIX) && key !== cacheKey(keepRoomId)) {
      remove(key)
      written.delete(key.slice(CACHE_PREFIX.length))
    }
    if (key.startsWith(SYNC_PREFIX) && key !== syncKey(keepRoomId)) remove(key)
  }
}

// Texto curto para o aviso de "mostrando os dados salvos".
export function describeSavedAt(savedAt: string, now = new Date()): string {
  if (!savedAt) return 'da última sincronização'
  const saved = new Date(savedAt)
  const minutes = Math.floor((now.getTime() - saved.getTime()) / 60000)
  if (Number.isNaN(minutes)) return 'da última sincronização'
  if (minutes < 2) return 'de agora há pouco'
  if (minutes < 60) return `de ${minutes} min atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? 'de 1 hora atrás' : `de ${hours} horas atrás`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'de ontem' : `de ${days} dias atrás`
}
