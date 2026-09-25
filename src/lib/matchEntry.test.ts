import { describe, expect, it } from 'vitest'
import { readManualScores } from './matchEntry'

const players = [
  { id: 'a', nickname: 'Lia' },
  { id: 'b', nickname: 'Caio' },
  { id: 'c', nickname: 'Bia' },
]
const everyone = { a: true, b: true, c: true }

describe('readManualScores', () => {
  it('não transforma campo vazio em zero', () => {
    expect(readManualScores(players, everyone, { a: '42000', b: '', c: '' })).toEqual({
      error: 'Preencha o placar de Caio e Bia ou desmarque quem não jogou.',
    })
  })

  it('aceita zero digitado e ignora quem foi desmarcado', () => {
    expect(readManualScores(players, { a: true, b: true, c: false }, { a: '0', b: '31500', c: '' })).toEqual({
      scores: [
        { playerId: 'a', score: 0 },
        { playerId: 'b', score: 31500 },
      ],
    })
  })

  it('exige pelo menos um participante', () => {
    expect(readManualScores(players, {}, {})).toEqual({ error: 'Selecione pelo menos um jogador.' })
  })

  it('recusa placar acima de 50.000', () => {
    expect(readManualScores(players, { a: true }, { a: '99999' })).toEqual({
      error: 'Preencha os placares entre 0 e 50.000.',
    })
  })
})
