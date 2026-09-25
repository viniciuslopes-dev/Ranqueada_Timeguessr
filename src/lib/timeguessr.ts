import type { GameMatch } from '../types'
import { leagueToday, shiftDay, validDay } from './progression'

// O app só registra os placares: quem abre o CronoRank antes de jogar precisa de
// um caminho curto até a partida do dia, por isso o link oficial mora aqui.
export const TIMEGUESSR_DAILY_URL = 'https://timeguessr.com/play?mode=daily'

// Partidas numeradas mais próximas que votam na data de um número novo.
const NEAREST_VOTERS = 10

export type GameDate = { date: string; source: 'existing' | 'history' | 'today' }

// A daily do TimeGuessr ganha um número por dia, então número e data andam
// juntos. A liga conhece essa relação pelas próprias partidas importadas:
// 1. o mesmo número já registrado define a data (a API recusa qualquer outra);
// 2. senão, vale a data mais votada pelas partidas numeradas mais próximas, para
//    que uma data lançada errado no passado não contamine as outras;
// 3. sem nenhuma partida numerada, fica hoje, como antes.
// Nunca passa de hoje: à noite a daily nova pode sair antes da virada do dia em
// Brasília, e a API recusa datas futuras.
export function deduceGameDate(gameNumber: number, matches: GameMatch[], today = leagueToday()): GameDate {
  const numbered = matches.filter(
    (match): match is GameMatch & { game_number: number } =>
      typeof match.game_number === 'number' && validDay(match.played_at),
  )
  const same = numbered.find((match) => match.game_number === gameNumber)
  if (same) return { date: same.played_at, source: 'existing' }

  const voters = [...numbered]
    .sort((a, b) => Math.abs(a.game_number - gameNumber) - Math.abs(b.game_number - gameNumber))
    .slice(0, NEAREST_VOTERS)
  if (!voters.length) return { date: today, source: 'today' }

  // o Map guarda a ordem de inserção: num empate, vence a partida mais próxima
  const votes = new Map<string, number>()
  for (const match of voters) {
    const date = shiftDay(match.played_at, gameNumber - match.game_number)
    votes.set(date, (votes.get(date) ?? 0) + 1)
  }
  const [date] = [...votes.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))
  return { date: date > today ? today : date, source: 'history' }
}
