import { describe, expect, it } from 'vitest'
import { uniqueAccounts } from './organizationMemberSearch'
describe('account search', () => {
  it('removes repeated account IDs without merging distinct accounts with matching names or emails', () => {
    const first = { user_id: 'one', name: 'Same name', email: 'same@example.test' }
    const second = { ...first, user_id: 'two' }
    expect(uniqueAccounts([first, second, first])).toEqual([first, second])
  })
})
