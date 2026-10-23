import { Activity, Network, Sparkles } from 'lucide-react'
import './neonatal-focus.css'

// Focus areas from the organization's public profile; these are not outcome claims.
export function NeoNatalFocus() {
  return <section className="neonatal-focus" aria-labelledby="neonatal-focus-heading">
    <div className="neonatal-section-heading">
      <p className="tenant-home-eyebrow">Our focus</p>
      <h2 id="neonatal-focus-heading">Complex disease. Shared questions.</h2>
    </div>
    <div className="neonatal-focus-grid">
      <article><Activity aria-hidden="true" /><h3>ME/CFS</h3><p>Myalgic encephalomyelitis / chronic fatigue syndrome</p></article>
      <article><Sparkles aria-hidden="true" /><h3>Fibromyalgia</h3><p>Part of the cluster of poorly understood diseases we focus on.</p></article>
      <article><Network aria-hidden="true" /><h3>Ehlers-Danlos syndrome</h3><p>Alongside other idiopathic diseases.</p></article>
    </div>
  </section>
}
