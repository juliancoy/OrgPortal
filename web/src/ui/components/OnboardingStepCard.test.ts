import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { OnboardingStepCard } from './OnboardingStepCard'
const organization={id:'lifetech-id',slug:'lifetech',name:'LifeTech'}
function card(id:string,completed=false){return renderToStaticMarkup(createElement(OnboardingStepCard,{step:{id,title:'Introduce Yourself',description:'Meet an organizer',href:'/governance/documents/lifetech-constitution'},completed,busy:false,organization,onComplete:()=>{}}))}
it('shows the organization chat inside the introduction card, including after confirmation',()=>{
 const html=card('participation',true)
 expect(html).toContain('<iframe')
 expect(html).toContain('org=lifetech')
 expect(html).toContain('is-complete')
 expect(html).toContain('✓ Confirmed')
 expect(html).not.toContain('Open resource')
})
it('labels the Constitution link specifically and keeps incomplete steps actionable',()=>{
 const html=card('constitution')
 expect(html).toContain('Read the Constitution and bylaws')
 expect(html).toContain('/governance/documents/lifetech-constitution')
 expect(html).toContain('I have completed this step')
 expect(html).not.toContain('is-complete')
})

it('uses the organization selected by the onboarding chat link',()=>{
 const html=renderToStaticMarkup(createElement(OnboardingStepCard,{step:{id:'participation',title:'Introduce Yourself',description:'Meet an organizer',href:'/chat?start=org&org=lifetech'},completed:false,busy:false,organization:{...organization,slug:'different-tenant'},onComplete:()=>{}}))
 expect(html).toContain('org=lifetech')
 expect(html).not.toContain('org=different-tenant')
})
