import { ACHIEVEMENTS, achievementProgress, type Earned } from './progression'
import type { RoomSnapshot } from '../types'

export type Achievement = (typeof ACHIEVEMENTS)[number]
export const CELEBRATION_MESSAGES: Record<Achievement['code'], string> = {
  first: 'A primeira viagem a gente não esquece. Seu álbum acaba de ganhar vida!',
  regular: 'Cinco dias, cinco novas histórias. Sua presença virou conquista!',
  explorer: 'Vinte dias explorando o mundo. Olha quanta história você já tem para contar!',
  personal: 'Você foi além da sua melhor marca. Esse recorde tem a sua assinatura!',
  improved: 'Sua evolução apareceu no placar. Uma semana melhor que a outra!',
  win: 'O topo do placar tem um novo nome: o seu. Celebre essa primeira vitória!',
  streak: 'Três vitórias seguidas. Que sequência para guardar no passaporte!',
  fazueli: 'Treze vitórias seguidas. O selo e o fundo Onda vermelha são seus!',
  year: 'Na linha do tempo, você cravou o destino. Ano exato!',
  map: 'Tão perto que dava para ir a pé. Seu palpite ficou a até 1 km!',
  perfect: '50.000 pontos. Uma viagem impecável merece um lugar de honra no álbum!',
  revenge: 'A história mudou de lado. Essa revanche já está guardada na coleção!',
  close: 'Cada ponto fez diferença. Uma vitória apertada para lembrar!',
  comeback: 'Até a última rodada, tudo pode acontecer. E você fez acontecer!',
  champion: 'A semana tem seu nome no topo. O título agora faz parte da sua história!',
  double: 'Duas semanas seguidas no topo. Seu passaporte ganhou uma coroa!',
  triple: 'Três títulos consecutivos. Uma dinastia para chamar de sua!',
  traveler: 'Dez dias de descobertas. Sua bagagem já está cheia de histórias!',
  veteran: 'Cinquenta dias pelo mundo. Essa coleção foi construída uma viagem de cada vez!',
  highscore: 'Você chegou aos 45 mil pontos. Seu próximo destino está cada vez mais perto!',
  round: '10.000 pontos em uma rodada. Um palpite que vale ouro!',
  historian: 'Cinco anos exatos na mesma partida. Você conhece os caminhos do tempo!',
}
export const CATEGORIES = ['Todas', 'Jornada', 'Precisão', 'Disputas', 'Temporadas'] as const
export function achievementCategory(code: string): (typeof CATEGORIES)[number] {
  if (['year', 'map', 'perfect', 'highscore', 'round', 'historian'].includes(code)) return 'Precisão'
  if (['win', 'streak', 'fazueli', 'revenge', 'close', 'comeback'].includes(code)) return 'Disputas'
  if (['champion', 'double', 'triple'].includes(code)) return 'Temporadas'
  return 'Jornada'
}
export const rarityClass = (a: Achievement) => (a.rarity === 'épica' ? 'epic' : a.rarity === 'rara' ? 'rare' : 'common')
const number = (value: number) => value.toLocaleString('pt-BR')
export function progressLabel(a: Achievement, value: number) {
  const current = Math.min(value, a.goal)
  if (['highscore', 'perfect', 'round'].includes(a.code)) return `${number(current)} / ${number(a.goal)} pontos`
  if (['regular', 'traveler', 'explorer', 'veteran'].includes(a.code))
    return `${current} de ${a.goal} dias${a.code === 'regular' ? ' nesta semana' : ' jogados'}`
  if (['streak', 'fazueli'].includes(a.code)) return `${current} de ${a.goal} vitórias seguidas`
  if (a.code === 'historian') return `${current} de 5 anos exatos na mesma partida`
  if (['double', 'triple'].includes(a.code)) return `${current} de ${a.goal} títulos seguidos`
  return current >= a.goal ? 'Objetivo alcançado' : 'Seu próximo feito começa aqui'
}
export function albumEntries(snapshot: RoomSnapshot, playerId: string) {
  return ACHIEVEMENTS.map((achievement) => ({
    achievement,
    earned: snapshot.progress?.earned.find((e) => e.playerId === playerId && e.code === achievement.code),
    value: Math.min(achievement.goal, achievementProgress(snapshot, playerId, achievement.code)),
  }))
}
export function unseenAchievements(earned: Earned[], playerId: string, seen: string[]) {
  return earned.filter(
    (e) => e.playerId === playerId && !seen.includes(e.code) && ACHIEVEMENTS.some((a) => a.code === e.code),
  )
}
export function parseSeenAchievements(raw: string | null): string[] | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    return Array.isArray(value) && value.every((code) => typeof code === 'string') ? value : null
  } catch {
    return null
  }
}
