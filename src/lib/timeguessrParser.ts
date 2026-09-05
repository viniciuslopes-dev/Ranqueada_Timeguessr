export type ParsedTimeGuessrRound = {
  roundNumber: number
  roundScore: number
  yearError: number
  distanceKm: number
}

export type ParsedTimeGuessrResult = {
  gameNumber: number
  totalScore: number
  rounds: ParsedTimeGuessrRound[]
}

const scoreFromText = (value: string) => Number(value.replace(/\D/g, ''))

function decimalFromText(value: string): number {
  const compact = value.replace(/\s/g, '')
  const lastDot = compact.lastIndexOf('.')
  const lastComma = compact.lastIndexOf(',')
  const decimalIndex = Math.max(lastDot, lastComma)
  if (decimalIndex < 0) return Number(compact)
  const integer = compact.slice(0, decimalIndex).replace(/[.,]/g, '')
  const decimal = compact.slice(decimalIndex + 1).replace(/[.,]/g, '')
  return Number(`${integer}.${decimal}`)
}

// varias mensagens coladas de uma vez: cada resultado compartilhado comeca com o
// cabecalho "TimeGuessr #N", entao quebramos o texto nesses pontos. Uma mensagem
// so continua caindo no caminho de sempre.
export function parseTimeGuessrShares(raw: string): ParsedTimeGuessrResult[] {
  const text = raw
  const headers: number[] = []
  const finder = /TimeGuessr\s*#\s*\d+/gi
  let header = finder.exec(text)
  while (header) {
    headers.push(header.index)
    header = finder.exec(text)
  }
  if (headers.length <= 1) return [parseTimeGuessrShare(raw)]
  return headers.map((from, index) => parseTimeGuessrShare(text.slice(from, headers[index + 1] ?? text.length)))
}

export function parseTimeGuessrShare(raw: string): ParsedTimeGuessrResult {
  const text = raw.replace(/\uFE0F/g, '').trim()
  if (!text) throw new Error('Cole a mensagem de resultado do TimeGuessr.')

  const header = text.match(/TimeGuessr\s*#\s*(\d+)\s*(?:—|–|-)\s*([\d.,\s]+)\s*\/\s*50[.,]?000/i)
  if (!header) throw new Error('Não encontrei o número e a pontuação do TimeGuessr na primeira linha.')

  const gameNumber = Number(header[1])
  const totalScore = scoreFromText(header[2])
  const rounds: ParsedTimeGuessrRound[] = []
  const roundPattern = /([1-5])(?:\u20E3)?\s*🏆\s*([\d.,\s]+?)\s*(?:·|•|-)+\s*📅\s*([\d.,]+)\s*(?:y|anos?)\s*(?:·|•|-)+\s*[🌍🌎]\s*([\d.,]+)\s*(km|m)\b/iu

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(roundPattern)
    if (!match) continue
    const roundNumber = Number(match[1])
    const roundScore = scoreFromText(match[2])
    const yearError = decimalFromText(match[3])
    let distanceKm = decimalFromText(match[4])
    if (match[5].toLowerCase() === 'm') distanceKm /= 1000
    rounds.push({ roundNumber, roundScore, yearError, distanceKm })
  }

  rounds.sort((a, b) => a.roundNumber - b.roundNumber)
  if (rounds.length !== 5 || new Set(rounds.map((round) => round.roundNumber)).size !== 5) {
    throw new Error('Não consegui ler as cinco rodadas. Copie a mensagem completa do TimeGuessr.')
  }
  if (!Number.isInteger(gameNumber) || gameNumber < 1 || !Number.isInteger(totalScore) || totalScore < 0 || totalScore > 50000) {
    throw new Error('O número da partida ou a pontuação total parece inválido.')
  }
  if (rounds.some((round) => !Number.isInteger(round.roundScore) || round.roundScore < 0 || round.roundScore > 10000 || !Number.isInteger(round.yearError) || round.yearError < 0 || !Number.isFinite(round.distanceKm) || round.distanceKm < 0)) {
    throw new Error('Uma das rodadas tem valores fora do formato esperado.')
  }

  const roundTotal = rounds.reduce((sum, round) => sum + round.roundScore, 0)
  if (roundTotal !== totalScore) throw new Error('A soma das cinco rodadas não confere com a pontuação total.')

  return { gameNumber, totalScore, rounds }
}
