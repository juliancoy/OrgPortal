import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {PresentationVotingStatus} from './PresentationVotingStatus'

function render(closed=false,signedIn=false){
 return renderToStaticMarkup(<MemoryRouter initialEntries={['/events/lifetech-demo-day-3#submissions']}><PresentationVotingStatus closesAt="2026-11-25T01:30:00.000Z" closed={closed} signedIn={signedIn}/></MemoryRouter>)
}
it('shows the voting deadline and returns signed-out voters to the event after login',()=>{
 const html=render()
 expect(html).toContain('Voting closes')
 expect(html).toContain('dateTime="2026-11-25T01:30:00.000Z"')
 expect(html).toContain('one week after the event ends')
 expect(html).toContain('Sign in to vote')
 expect(html).toContain('/users/login?next=%2Fevents%2Flifetech-demo-day-3%23submissions')
})
it('does not offer sign-in for a closed ballot or an already signed-in voter',()=>{
 expect(render(true)).toContain('Voting is closed')
 expect(render(true)).not.toContain('Sign in to vote')
 expect(render(false,true)).not.toContain('Sign in to vote')
})
