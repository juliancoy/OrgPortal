import { EmbeddedOrganizationChat } from './EmbeddedOrganizationChat'

type Step = { id: string; title: string; description: string; href: string }
const labels: Record<string, string> = {
  constitution: 'Read the Constitution and bylaws',
  communications: 'Read communications and conduct guidelines',
  meetings: 'View upcoming meetings and events',
}
export function OnboardingStepCard({ step, completed, busy, organization, onComplete }: {
  step: Step; completed: boolean; busy: boolean;
  organization: { id: string; slug: string; name: string }; onComplete: () => void
}) {
  const chatSlug=step.id==='participation'?new URL(step.href,'https://portal.invalid').searchParams.get('org')||organization.slug:organization.slug
  return <li id={step.id} className={completed ? 'onboarding-step is-complete' : 'onboarding-step'}>
    <h2>{step.title}</h2><p>{step.description}</p>
    {step.id === 'participation'
      ? <EmbeddedOrganizationChat {...organization} slug={chatSlug} />
      : <a href={step.href} target={step.href.startsWith('https:') ? '_blank' : undefined} rel="noreferrer">{labels[step.id] || step.title}{step.href.startsWith('https:') ? ' (new tab)' : ''}</a>}
    {completed ? <p className="onboarding-confirmed">✓ Confirmed</p> : <button disabled={busy} onClick={onComplete}>I have completed this step</button>}
  </li>
}
