import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { lazyPage, withRouteModules } from './routeModules'

async function resolvePage(route: ReturnType<typeof withRouteModules>[number]) {
  if (typeof route.lazy !== 'function') throw new Error('Expected a lazy route')
  return await route.lazy() as { element: ReactNode }
}

describe('navigation page modules', () => {
  it('waits for the destination module and preserves its authorization wrapper', async () => {
    let release!: (module: { default: () => ReactNode }) => void
    const load = vi.fn(() => new Promise<{ default: () => ReactNode }>(resolve => { release = resolve }))
    const Page = lazyPage(load)
    const Wrapper = ({ children }: { children?: ReactNode }) => <section data-permission="required">{children}</section>
    const route = withRouteModules([{ path: '/page', element: <Wrapper><Page /></Wrapper> }])[0]
    expect(route.element).toBeUndefined()
    let committed = false
    const first = resolvePage(route).then(result => { committed = true; return result })
    const second = resolvePage(route)
    await Promise.resolve()
    expect(committed).toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
    release({ default: () => <h1>Ready</h1> })
    const resolved = await first
    expect(renderToStaticMarkup(resolved.element)).toBe('<section data-permission="required"><h1>Ready</h1></section>')
    expect((await second).element).toBe(resolved.element)
  })

  it('retries failed code downloads and leaves unrelated routes unloaded', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ default: () => <p>Recovered</p> })
    const unrelated = vi.fn()
    const Page = lazyPage(load)
    const Other = lazyPage(unrelated)
    const routes = withRouteModules([{ element: <div>Shell</div>, children: [{ path: '/page', element: <Page /> }, { path: '/other', element: <Other /> }] }])
    const route = routes[0].children![0]
    await expect(resolvePage(route)).rejects.toThrow('Offline')
    expect(renderToStaticMarkup((await resolvePage(route)).element)).toBe('<p>Recovered</p>')
    expect(unrelated).not.toHaveBeenCalled()
  })
})
