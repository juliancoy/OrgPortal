import { Children, cloneElement, createElement, isValidElement, lazy as reactLazy } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { matchRoutes, type RouteObject } from 'react-router-dom'

type PageModule = { default: ComponentType<any> }
const modules = new WeakMap<object, () => Promise<PageModule>>()
const preloads = new WeakMap<RouteObject, () => Promise<{ element: ReactNode }>>()

export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let pending: Promise<{ default: T }> | undefined
  const preload = () => pending ||= load().catch(error => { pending = undefined; throw error })
  const component = reactLazy(preload)
  modules.set(component, preload)
  return component
}

function needsModule(node: ReactNode): boolean {
  if (!isValidElement<{ children?: ReactNode }>(node)) return false
  return modules.has(node.type as object) || Children.toArray(node.props.children).some(needsModule)
}

async function resolveElement(node: ReactNode): Promise<ReactNode> {
  if (!isValidElement<{ children?: ReactNode }>(node)) return node
  const load = modules.get(node.type as object)
  if (load) return createElement((await load()).default, { ...node.props, key: node.key })
  if (!node.props.children) return node
  return cloneElement(node, { children: await Promise.all(Children.toArray(node.props.children).map(resolveElement)) })
}

/** Resolve page modules before committing navigation, preserving the current page. */
export function withRouteModules(routes: RouteObject[]): RouteObject[] {
  return routes.map(route => {
    const next = { ...route, ...(route.children ? { children: withRouteModules(route.children) } : {}) } as RouteObject
    if (needsModule(route.element)) {
      let pending: Promise<{ element: ReactNode }> | undefined
      const load = () => pending ||= resolveElement(route.element).then(element => ({ element })).catch(error => { pending = undefined; throw error })
      delete next.element
      next.lazy = load
      preloads.set(next, load)
    }
    return next
  })
}

/** Prefetch code only; hovering a link must never run loaders or authenticated requests. */
export function installRoutePrefetch(routes: RouteObject[], basename: string) {
  const prefetch = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType || '')) return
    const url = new URL(link.href, location.href)
    if (url.origin !== location.origin || url.pathname === location.pathname) return
    for (const match of matchRoutes(routes, url.pathname, basename) || []) {
      void preloads.get(match.route)?.().catch(() => { /* Navigation retains its normal error handling. */ })
    }
  }
  document.addEventListener('pointerover', prefetch)
  document.addEventListener('focusin', prefetch)
  return () => {
    document.removeEventListener('pointerover', prefetch)
    document.removeEventListener('focusin', prefetch)
  }
}
