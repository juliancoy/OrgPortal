export const USD_COLOR = 0x269c4a
export const IN_KIND_COLOR = 0xe4b624
const colors = { funding:0xad7b26, affiliation:0x8564b3, incubation:0x357db7, acceleration:0x357db7, collaboration:0x16847d, services:0x16847d, mentoring:0x8564b3, venue:0x77878c, in_kind:IN_KIND_COLOR }

export function relationshipColor(edge) {
 if (edge.kind === 'in_kind' || edge.relationship === 'in_kind') return IN_KIND_COLOR
 const usd = edge.currency === 'USD' || (!edge.currency && /^\$/.test(edge.amountLabel || ''))
 if (usd && (edge.relationship === 'funding' || edge.kind === 'transfer')) return USD_COLOR
 return colors[edge.relationship] ?? 0x77878c
}
