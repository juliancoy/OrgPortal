import { useId, useState } from 'react'
import { modelNametagPrint } from '../utils/modelNametagPrint'

/** A schematic of the printer output, separate from the unscaled print document. */
export function NametagPrintModel({ onPrintAdjusted, disabled = false }: { onPrintAdjusted?: (border: number) => void; disabled?: boolean }) {
  const [border, setBorder] = useState('7.14')
  const id = useId()
  const value = border.trim() === '' ? NaN : Number(border)
  const valid = Number.isFinite(value) && value >= 0 && value <= 25
  const model = valid ? modelNametagPrint(value) : null
  return <fieldset className="conference-nametag-options conference-nametag-print-model">
    <legend>Expected final print · fit to printable area</legend>
    <label>Anticipated printer border on every edge (mm)
      <input type="number" min="0" max="25" step="0.01" value={border} aria-invalid={!valid} onChange={event => setBorder(event.target.value)} />
    </label>
    {!model ? <p role="alert">Enter a border from 0 to 25 mm.</p> : <>
      <p role="status">Fit scale: {(model.scale * 100).toFixed(2)}%. Expected badge: {model.cardWidth.toFixed(2)} × {model.cardHeight.toFixed(2)} mm.</p>
      <svg viewBox="-9 -8 120 169" role="img" aria-labelledby={id} className="conference-nametag-print-diagram">
        <title id={id}>Expected 4 by 6 inch print with {value} mm printer borders and {model.cardWidth.toFixed(2)} by {model.cardHeight.toFixed(2)} mm badges</title>
        <rect x="0" y="0" width="101.6" height="152.4" fill="#e5e7eb" stroke="#64748b" strokeWidth="0.4" />
        <rect x={value} y={value} width={101.6 - 2 * value} height={152.4 - 2 * value} fill="white" stroke="#64748b" strokeDasharray="2 1" strokeWidth="0.3" />
        <rect x={model.sheetX} y={model.sheetY} width={101.6 * model.scale} height={152.4 * model.scale} fill="none" stroke="#0f6f8f" strokeWidth="0.3" />
        {(['Front', 'Back'] as const).map((side, index) => <g key={side}>
          <rect x={model.cardX} y={model.cardY + index * model.cardStep} width={model.cardWidth} height={model.cardHeight} rx={3 * model.scale} fill="#061a26" />
          <text x="50.8" y={model.cardY + index * model.cardStep + model.cardHeight / 2} fill="white" textAnchor="middle" fontSize="4">{side}</text>
        </g>)}
        <text x="50.8" y="-3" textAnchor="middle" fontSize="3.5" fill="#334155">101.6 mm · 4 inches</text>
        <text x="50.8" y="159" textAnchor="middle" fontSize="3" fill="#334155">Gray = printer border · teal = scaled sheet</text>
      </svg>
      <p className="muted">Assumes a centered sheet, equal borders on all edges and proportional “fit to printable area” scaling. Actual size / 100% printing does not apply this reduction. Standard prints and downloads are unchanged.</p>
      {onPrintAdjusted && <>
        <p>To restore credit-card size after this reduction, the adjusted sheet enlarges the artwork to {(100 / model.scale).toFixed(2)}%. Print that sheet using 4 × 6 paper and “fit to printable area”, with the modeled border.</p>
        <button type="button" disabled={disabled || value > 8} onClick={() => onPrintAdjusted(value)}>Print border-adjusted pair on 4 × 6</button>
        {value > 8 && <p role="alert">A border above 8 mm needs larger paper to compensate without clipping the cards.</p>}
      </>}
    </>}
  </fieldset>
}
