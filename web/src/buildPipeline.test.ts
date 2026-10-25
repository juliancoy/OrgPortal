import { describe, expect, it } from 'vitest'
// Build tooling is JavaScript and runs directly in Node.
// @ts-expect-error JavaScript build entry point has no TypeScript declaration.
import { build } from '../scripts/build.mjs'

describe('production build gates', () => {
  it('overlaps type checking and bundling, then waits for both', async () => {
    const started: string[] = []
    let finishTypes!: () => void
    let finishBundle!: () => void
    let done = false
    const result = build((label: string) => {
      started.push(label)
      if (label === 'TypeScript') return new Promise<void>(resolve => { finishTypes = resolve })
      if (label === 'Vite') return new Promise<void>(resolve => { finishBundle = resolve })
      return Promise.resolve()
    }).then(() => { done = true })
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['Network positions', 'Ecosystem query index', 'TypeScript', 'Vite'])
    finishTypes()
    await Promise.resolve()
    expect(done).toBe(false)
    finishBundle()
    await result
    expect(done).toBe(true)
  })

  it.each(['TypeScript', 'Vite'])('fails when %s fails', async failing => {
    await expect(build((label: string) => label === failing
      ? Promise.reject(new Error('deliberate failure')) : Promise.resolve())).rejects.toThrow('Frontend build failed')
  })

  it('does not build with failed generated inputs', async () => {
    const started: string[] = []
    await expect(build((label: string) => {
      started.push(label)
      return Promise.reject(new Error('generation failed'))
    })).rejects.toThrow('generation failed')
    expect(started).toEqual(['Network positions'])
  })
})
