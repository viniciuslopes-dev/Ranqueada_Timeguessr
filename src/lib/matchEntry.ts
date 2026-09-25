import type { Player } from '../types'

export type ManualScores = { scores: Array<{ playerId: string; score: number }> } | { error: string }

const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]

// Placares digitados à mão. Campo vazio não é zero: sem essa conferência, quem
// ficou sem placar entraria na partida com 0 pontos, contando presença no
// campeonato e caindo para o último lugar.
export function readManualScores(
  players: Array<Pick<Player, 'id' | 'nickname'>>,
  active: Record<string, boolean>,
  values: Record<string, string>,
): ManualScores {
  const participants = players.filter((player) => active[player.id])
  if (!participants.length) return { error: 'Selecione pelo menos um jogador.' }

  const blank = participants.filter((player) => !values[player.id]?.trim())
  if (blank.length) {
    return {
      error: `Preencha o placar de ${listNames(blank.map((player) => player.nickname))} ou desmarque quem não jogou.`,
    }
  }

  const scores = participants.map((player) => ({ playerId: player.id, score: Number(values[player.id]) }))
  if (scores.some((item) => !Number.isInteger(item.score) || item.score < 0 || item.score > 50000)) {
    return { error: 'Preencha os placares entre 0 e 50.000.' }
  }
  return { scores }
}
