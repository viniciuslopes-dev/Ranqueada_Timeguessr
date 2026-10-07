import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, type Earned } from './progression'
import { parseSeenAchievements, progressLabel, unseenAchievements } from './achievementAlbum'

describe('álbum e notificações de conquistas', () => {
  it('recupera armazenamento inválido sem tratar strings e objetos como uma lista', () => {
    for (const raw of [null, '{', '{}', '"first"', '[1]', 'null']) expect(parseSeenAchievements(raw)).toBeNull()
    expect(parseSeenAchievements('[]')).toEqual([])
    expect(parseSeenAchievements('["first"]')).toEqual(['first'])
  })
  it('celebra somente conquistas conhecidas e ainda não vistas do perfil ativo', () => {
    const earned: Earned[] = [
      { id: 'a:first', playerId: 'a', code: 'first', date: '', evidence: '' },
      { id: 'a:win', playerId: 'a', code: 'win', date: '', evidence: '' },
      { id: 'b:round', playerId: 'b', code: 'round', date: '', evidence: '' },
      { id: 'a:unknown', playerId: 'a', code: 'unknown', date: '', evidence: '' },
    ]
    expect(unseenAchievements(earned, 'a', ['first']).map((e) => e.code)).toEqual(['win'])
    expect(unseenAchievements(earned, 'a', ['first', 'win'])).toEqual([])
    expect(unseenAchievements(earned.slice(0, 1), 'a', ['first'])).toEqual([])
  })
  it('explica a unidade e o período das metas sem ultrapassar o objetivo', () => {
    const a = (code: string) => ACHIEVEMENTS.find((item) => item.code === code)!
    expect(progressLabel(a('regular'), 4)).toBe('4 de 5 dias nesta semana')
    expect(progressLabel(a('highscore'), 49000)).toBe('45.000 / 45.000 pontos')
    expect(progressLabel(a('historian'), 4)).toBe('4 de 5 anos exatos na mesma partida')
  })
})
