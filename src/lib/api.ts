import type { ImportResultInput, MatchInput, MatchUpdateInput, RoomSnapshot } from '../types'

type ApiPayload = Record<string, unknown>

export type RoomAccess = {
  roomId: string
  code?: string
  accessToken: string
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Rede caida, banco dormindo ou deploy no ar: nada disso pode custar o acesso
// guardado no aparelho — o app espera e tenta de novo.
export const isTemporaryFailure = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500)

// Só estas respostas dizem que o acesso salvo morreu de verdade: token invalido
// ou liga apagada. Aí sim o código da liga volta a ser necessário.
export const isAccessRevoked = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)

const apiUrl = import.meta.env.VITE_API_URL?.trim() || '/.netlify/functions/api'
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

// Na Netlify, a API Neon é usada automaticamente. Em desenvolvimento local com
// `vite`, o modo demonstração continua ativo; use VITE_USE_NEON=true com `netlify dev`.
export const isNeonApiEnabled =
  import.meta.env.VITE_USE_NEON === 'true' ||
  (import.meta.env.PROD && !localHosts.has(window.location.hostname))

export async function apiRequest<T>(action: string, payload: ApiPayload = {}, accessToken?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new ApiError('Sem internet agora. Tente de novo quando a conexão voltar.', 0)
  }

  const result = await response.json().catch(() => ({ error: 'Resposta inválida da API.' })) as T & { error?: string }
  if (!response.ok) throw new ApiError(result.error || 'A operação não pôde ser concluída.', response.status)
  return result
}

export const neonApi = {
  createRoom: (name: string, nickname: string) =>
    apiRequest<RoomAccess>('create_room', { name, nickname }),
  joinRoom: (code: string, nickname: string) =>
    apiRequest<RoomAccess>('join_room', { code, nickname }),
  loadRoom: (roomId: string, token: string) =>
    apiRequest<RoomSnapshot>('load_room', { roomId }, token),
  addPlayer: (roomId: string, nickname: string, color: string, token: string) =>
    apiRequest<{ ok: true }>('add_player', { roomId, nickname, color }, token),
  updatePlayer: (roomId: string, playerId: string, nickname: string, color: string, token: string) =>
    apiRequest<{ ok: true }>('update_player', { roomId, playerId, nickname, color }, token),
  deletePlayer: (roomId: string, playerId: string, token: string) =>
    apiRequest<{ ok: true }>('delete_player', { roomId, playerId }, token),
  addMatch: (roomId: string, input: MatchInput, token: string) =>
    apiRequest<{ ok: true }>('add_match', { roomId, ...input }, token),
  importResult: (roomId: string, input: ImportResultInput, token: string) =>
    apiRequest<{ ok: true; matchId: string; created: boolean }>('import_result', { roomId, ...input }, token),
  updateMatch: (roomId: string, matchId: string, input: MatchUpdateInput, token: string) =>
    apiRequest<{ ok: true }>('update_match', { roomId, matchId, ...input }, token),
  deleteMatch: (roomId: string, matchId: string, token: string) =>
    apiRequest<{ ok: true }>('delete_match', { roomId, matchId }, token),
}
