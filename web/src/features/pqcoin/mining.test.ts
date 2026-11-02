import { describe, expect, it } from 'vitest'
import { conventionalMiningCommand, validRewardAddress } from './mining'
describe('public mining command generation', () => {
  it('accepts public addresses and never interpolates shell syntax or private key text', () => {
    const address = 'ab'.repeat(32)
    expect(validRewardAddress(address)).toBe(true)
    expect(conventionalMiningCommand(address)).toContain(`--mine-to ${address}`)
    for (const invalid of ['', '0'.repeat(64), 'AB'.repeat(32), address+'; id', '$(id)', '-----BEGIN PRIVATE KEY-----', address+'\n']) {
      expect(validRewardAddress(invalid)).toBe(false)
      expect(() => conventionalMiningCommand(invalid)).toThrow()
    }
  })
})
