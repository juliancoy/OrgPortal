/** Millimeters. Model a centered 4 × 6 sheet fitted into symmetric printer margins. */
export function modelNametagPrint(border: number) {
  if (!Number.isFinite(border) || border < 0 || border > 25) throw new RangeError('Printer border must be between 0 and 25 mm')
  const scale = Math.min((101.6 - 2 * border) / 101.6, (152.4 - 2 * border) / 152.4)
  const sheetX = (101.6 - 101.6 * scale) / 2
  const sheetY = (152.4 - 152.4 * scale) / 2
  return {
    scale, sheetX, sheetY,
    cardWidth: 85.6 * scale, cardHeight: 53.98 * scale,
    cardX: sheetX + (101.6 - 85.6) / 2 * scale,
    cardY: sheetY + (152.4 - (2 * 53.98 + 6)) / 2 * scale,
    cardStep: (53.98 + 6) * scale,
  }
}
