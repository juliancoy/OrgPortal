import { useState } from 'react'
import type { Section } from './GovernanceDocumentPage'

type Candidate = {version:number;candidateHash:string;title:string;sections:Section[]}
type Choice = 'yea'|'nay'|'abstain'
const stages=['Capture draft','Second motion','State the question','Record notice','Open ballot','Cast ballots','Resolve']
export function rehearsalResult(votes:(Choice|'')[]) {
 const yea=votes.filter(v=>v==='yea').length,nay=votes.filter(v=>v==='nay').length,participants=votes.filter(Boolean).length
 return {participants,yea,nay,quorum:participants>=2,passed:participants>=2&&yea>0&&yea*3>=2*(yea+nay)}
}
export function RatificationRehearsal({candidate}:{candidate:Candidate}) {
 const [snapshot,setSnapshot]=useState<Candidate|null>(null),[stage,setStage]=useState(0),[votes,setVotes]=useState<(Choice|'')[]>(['','',''])
 const [resolved,setResolved]=useState(false),[history,setHistory]=useState<string[]>([]),[showText,setShowText]=useState(false)
 const result=rehearsalResult(votes)
 function reset(){setSnapshot(null);setStage(0);setVotes(['','','']);setResolved(false);setHistory([]);setShowText(false)}
 function advance(){
  if(stage===0)setSnapshot(JSON.parse(JSON.stringify(candidate)))
  setHistory(items=>[...items,stages[stage]+' — simulated'])
  if(stage===6)setResolved(true)
  else setStage(value=>value+1)
 }
 return <section className="ratification-rehearsal" aria-label="Ratification rehearsal">
  <h2>Practice ratification while drafting</h2>
  <p><strong>Rehearsal only · working draft stays editable.</strong> Test the whole sequence yourself using three fictional organizers. Notice and ballot waiting periods are simulated. Nothing is submitted, adopted, or saved to the organization’s records.</p>
  <p>This is a browser walkthrough, not a test of real organizer permissions, notice delivery, or server enforcement. Rehearsal progress resets when you leave or reload.</p>
  <ol className="rehearsal-stages">{stages.map((label,index)=><li key={label} aria-current={!resolved&&index===stage?'step':undefined}>{index<stage||resolved?'✓ ':''}{label}</li>)}</ol>
  {snapshot&&<><p>Practice candidate: revision {snapshot.version} · {snapshot.candidateHash.slice(0,12)} · {snapshot.sections.length} titles.</p>
   {snapshot.candidateHash!==candidate.candidateHash&&<p role="status">The working draft changed. This rehearsal keeps its captured copy. Restart to practice with the latest text.</p>}
   <button onClick={()=>setShowText(value=>!value)}>{showText?'Hide practice candidate':'Read practice candidate'}</button>
   {showText&&<details open><summary>{snapshot.title}</summary>{snapshot.sections.map(section=><section key={section.id}><h3>{section.title}</h3><p className="governance-document-text">{section.text}</p></section>)}</details>}
  </>}
  {stage===5&&<fieldset><legend>Practice ballots · fictional organizers</legend>{votes.map((vote,index)=><label key={index}>Test organizer {index+1}<select aria-label={`Test organizer ${index+1}`} value={vote} onChange={event=>setVotes(values=>values.map((value,i)=>i===index?event.target.value as Choice|'':value))}>
   <option value="">No ballot</option><option value="yea">Yes</option><option value="nay">No</option><option value="abstain">Abstain</option>
  </select></label>)}<p>Quorum: 2 of 3 participants. At least two thirds of yes/no votes must approve. Abstentions count toward participation only.</p></fieldset>}
  {resolved?<p role="status"><strong>{result.passed?'Practice result: would pass':'Practice result: would fail'}</strong> · {result.yea} yes, {result.nay} no · {result.participants}/3 participated · {result.quorum?'quorum met':'quorum not met'}. The real document is still an unratified draft.</p>:<button onClick={advance}>{stage===0?'Start ratification rehearsal':stage===1?'Simulate a different organizer seconding':stage===2?'Simulate chair stating the question':stage===3?'Simulate notice and seven-day wait':stage===4?'Open practice ballot':stage===5?'Simulate closing the 24-hour ballot':'Resolve practice ballot'}</button>}
  {snapshot&&<button onClick={reset}>Restart rehearsal with current draft</button>}
  {history.length>0&&<details><summary>Rehearsal activity</summary><ol>{history.map((item,index)=><li key={index}>{item}</li>)}</ol></details>}
 </section>
}
