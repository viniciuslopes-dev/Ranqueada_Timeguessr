// guardamos tudo em km, mas abaixo de 1 km o numero fica ilegivel ("0,1 km"),
// entao a exibicao cai para metros.
export type FormattedDistance = { value: string; unit: 'km' | 'm' }

export function formatDistance(km: number | null | undefined): FormattedDistance {
  if (km === null || km === undefined || !Number.isFinite(km)) return { value: '—', unit: 'km' }
  const meters = Math.round(km * 1000)
  // 0,9996 km arredonda para 1000 m: nesse caso o certo e mostrar 1 km.
  if (meters < 1000) return { value: meters.toLocaleString('pt-BR'), unit: 'm' }
  return { value: km.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), unit: 'km' }
}

export function formatDistanceLabel(km: number | null | undefined): string {
  const { value, unit } = formatDistance(km)
  return value === '—' ? value : `${value} ${unit}`
}
