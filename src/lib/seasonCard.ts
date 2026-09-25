import type { Season } from './progression'
import { formatShortDate } from './ranking'

// Canvas usa somente texto e formas locais; não envia resultados para terceiros.
export async function downloadSeasonCard(roomName: string, season: Season) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu criar o cartão.')
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350)
  gradient.addColorStop(0, '#101b36')
  gradient.addColorStop(1, '#28345b')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1080, 1350)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f7cc67'
  ctx.font = 'bold 35px sans-serif'
  ctx.fillText('CRONORANK · CAMPEONATO SEMANAL', 540, 120)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 65px sans-serif'
  ctx.fillText(roomName, 540, 220, 940)
  ctx.font = '32px sans-serif'
  ctx.fillStyle = '#ccd4e7'
  ctx.fillText(
    `${formatShortDate(season.start)} — ${formatShortDate(season.end)} · ${season.start.slice(0, 4)}`,
    540,
    290,
  )
  ctx.fillStyle = '#f7cc67'
  ctx.beginPath()
  ctx.moveTo(445, 350)
  ctx.lineTo(635, 350)
  ctx.lineTo(615, 450)
  ctx.quadraticCurveTo(540, 570, 465, 450)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(530, 480, 20, 95)
  ctx.fillRect(480, 570, 120, 18)
  season.standings.slice(0, 5).forEach((p, i) => {
    const y = 680 + i * 98
    ctx.fillStyle = i === 0 ? '#f7cc67' : '#ffffff'
    ctx.textAlign = 'left'
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText(`${p.position}º`, 90, y)
    ctx.fillText(p.nickname, 175, y, 580)
    ctx.textAlign = 'right'
    ctx.fillText(`${p.points} pts`, 980, y)
    ctx.strokeStyle = '#ffffff20'
    ctx.beginPath()
    ctx.moveTo(90, y + 34)
    ctx.lineTo(990, y + 34)
    ctx.stroke()
  })
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f7cc67'
  ctx.font = 'bold 31px sans-serif'
  ctx.fillText('Nova semana. Nova chance. Sua história fica.', 540, 1250)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Não foi possível gerar a imagem.'))),
      'image/png',
    ),
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `cronorank-semana-${season.start}.png`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
