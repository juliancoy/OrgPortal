export type MoneySupplyPoint = {
  timestamp: string
  total_supply: number
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function resampleHistory(points: MoneySupplyPoint[], targetSamples: number): MoneySupplyPoint[] {
  if (points.length <= 2 || points.length <= targetSamples) return points
  const lastIndex = points.length - 1
  const samples: MoneySupplyPoint[] = []
  for (let i = 0; i < targetSamples; i += 1) {
    const t = (i / (targetSamples - 1)) * lastIndex
    const left = Math.floor(t)
    const right = Math.min(lastIndex, Math.ceil(t))
    const leftPoint = points[left]
    const rightPoint = points[right]
    const weight = t - left
    const interpolatedSupply =
      toFiniteNumber(leftPoint.total_supply) * (1 - weight) + toFiniteNumber(rightPoint.total_supply) * weight
    const timestamp = rightPoint?.timestamp || leftPoint.timestamp

    samples.push({
      timestamp,
      total_supply: interpolatedSupply,
    })
  }
  return samples
}
