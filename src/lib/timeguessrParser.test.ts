import { describe, expect, it } from 'vitest'
import { parseTimeGuessrShare, parseTimeGuessrShares } from './timeguessrParser'

const whatsappExample = `TimeGuessr #1191 — 27,839/50,000
1️⃣ 🏆6.756 · 📅 5y · 🌍 1288.5km
2️⃣ 🏆8.338 · 📅 7y · 🌍 2.6km
3️⃣ 🏆4.105 · 📅 32y · 🌍 395.2km
4️⃣ 🏆3.678 · 📅 24y · 🌍 822.0km
5️⃣ 🏆4.962 · 📅 1y · 🌍 8522.7km
https://timeguessr.com`

const secondExample = `TimeGuessr #1191 — 41,120/50,000
1️⃣ 🏆9.100 · 📅 1y · 🌍 12.4km
2️⃣ 🏆8.020 · 📅 3y · 🌍 40.1km
3️⃣ 🏆7.500 · 📅 6y · 🌍 120.0km
4️⃣ 🏆8.400 · 📅 2y · 🌍 33.3km
5️⃣ 🏆8.100 · 📅 4y · 🌍 61.9km
https://timeguessr.com`

describe('parseTimeGuessrShares', () => {
  it('separa varias mensagens coladas de uma vez', () => {
    const results = parseTimeGuessrShares(`${whatsappExample}

${secondExample}`)
    expect(results).toHaveLength(2)
    expect(results.map((result) => result.totalScore)).toEqual([27839, 41120])
    // o mesmo jogo aparece nos dois: e o caso normal, a turma toda jogou a mesma partida
    expect(results.map((result) => result.gameNumber)).toEqual([1191, 1191])
  })

  it('devolve uma lista de um item quando so ha uma mensagem', () => {
    expect(parseTimeGuessrShares(whatsappExample)).toHaveLength(1)
  })

  it('propaga o erro quando um dos blocos esta incompleto', () => {
    const truncated = `${whatsappExample}

TimeGuessr #1192 — 10,000/50,000
1️⃣ 🏆10.000 · 📅 1y · 🌍 1.0km`
    expect(() => parseTimeGuessrShares(truncated)).toThrow(/cinco rodadas/i)
  })
})

describe('parseTimeGuessrShare', () => {
  it('lê a mensagem real compartilhada pelo WhatsApp', () => {
    expect(parseTimeGuessrShare(whatsappExample)).toEqual({
      gameNumber: 1191,
      totalScore: 27839,
      rounds: [
        { roundNumber: 1, roundScore: 6756, yearError: 5, distanceKm: 1288.5 },
        { roundNumber: 2, roundScore: 8338, yearError: 7, distanceKm: 2.6 },
        { roundNumber: 3, roundScore: 4105, yearError: 32, distanceKm: 395.2 },
        { roundNumber: 4, roundScore: 3678, yearError: 24, distanceKm: 822 },
        { roundNumber: 5, roundScore: 4962, yearError: 1, distanceKm: 8522.7 },
      ],
    })
  })

  it('aceita variações de emoji, hífen, separador e distância em metros', () => {
    const result = parseTimeGuessrShare(`TimeGuessr #7 - 45.000/50.000
1️⃣ 🏆9,000 · 📅 0y · 🌎 450m
2️⃣ 🏆9,000 · 📅 1 ano · 🌎 1,5km
3️⃣ 🏆9,000 · 📅 2y · 🌎 2.0km
4️⃣ 🏆9,000 · 📅 3 anos · 🌎 30km
5️⃣ 🏆9,000 · 📅 4y · 🌎 4.5km`)
    expect(result.totalScore).toBe(45000)
    expect(result.rounds[0].distanceKm).toBe(0.45)
    expect(result.rounds[1].distanceKm).toBe(1.5)
  })

  it('converte distâncias em milhas e pés para km', () => {
    const result = parseTimeGuessrShare(`TimeGuessr #1195 — 32,665/50,000
1️⃣ 🏆6.838 · 📅 13y · 🌍 9.6mi
2️⃣ 🏆3.609 · 📅 13y · 🌍 1660.5mi
3️⃣ 🏆9.479 · 📅 3y · 🌍 3.3mi
4️⃣ 🏆6.634 · 📅 1y · 🌍 1520.4mi
5️⃣ 🏆6.105 · 📅 13y · 🌍 245.5ft
https://timeguessr.com`)
    expect(result.gameNumber).toBe(1195)
    expect(result.totalScore).toBe(32665)
    expect(result.rounds.map((round) => round.distanceKm)).toEqual([15.45, 2672.316, 5.311, 2446.847, 0.075])
  })

  it('explica quando a mensagem está incompleta', () => {
    expect(() => parseTimeGuessrShare(whatsappExample.split('\n').slice(0, 5).join('\n'))).toThrow(/cinco rodadas/i)
  })
})
