import { useEffect, useState } from 'react'
import { useNavigation } from 'react-router-dom'

function useDelayedLoading(active: boolean) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!active) { setVisible(false); return }
    const timer = window.setTimeout(() => setVisible(true), 180)
    return () => window.clearTimeout(timer)
  }, [active])
  return active && visible
}

export function RouteLoading() {
  const visible = useDelayedLoading(true)
  return <div style={{ minHeight: '30vh' }}>{visible && <p role="status">Loading page…</p>}</div>
}

export function NavigationProgress() {
  const navigation = useNavigation()
  const visible = useDelayedLoading(navigation.state !== 'idle')
  return visible ? <div role="status" className="portal-navigation-progress">Loading page…</div> : null
}
