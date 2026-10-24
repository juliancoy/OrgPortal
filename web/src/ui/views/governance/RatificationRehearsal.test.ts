import { expect,it } from 'vitest'
import { rehearsalResult } from './RatificationRehearsal'
it('practice results require quorum, two thirds and an affirmative vote',()=>{
 expect(rehearsalResult(['yea','','']).passed).toBe(false)
 expect(rehearsalResult(['yea','nay','']).passed).toBe(false)
 expect(rehearsalResult(['yea','yea','nay']).passed).toBe(true)
 expect(rehearsalResult(['yea','abstain','']).passed).toBe(true)
 expect(rehearsalResult(['abstain','abstain','']).passed).toBe(false)
})
