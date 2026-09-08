import { describe, expect, it } from 'vitest'
import { formatDistance, formatDistanceLabel } from './distance'

describe('formatDistance', () => {
  it('mostra em metros abaixo de 1 km', () => {
    expect(formatDistance(0.45)).toEqual({ value: '450', unit: 'm' })
    expect(formatDistance(0.075)).toEqual({ value: '75', unit: 'm' })
    expect(formatDistance(0)).toEqual({ value: '0', unit: 'm' })
  })

  it('mantem km a partir de 1 km', () => {
    expect(formatDistance(1)).toEqual({ value: '1', unit: 'km' })
    expect(formatDistance(1288.53)).toEqual({ value: '1.288,5', unit: 'km' })
  })

  it('nao mostra 1000 m: arredonda para 1 km', () => {
    expect(formatDistance(0.9996)).toEqual({ value: '1', unit: 'km' })
  })

  it('devolve travessao quando nao ha distancia', () => {
    expect(formatDistanceLabel(null)).toBe('—')
    expect(formatDistanceLabel(15.45)).toBe('15,5 km')
    expect(formatDistanceLabel(0.075)).toBe('75 m')
  })
})
