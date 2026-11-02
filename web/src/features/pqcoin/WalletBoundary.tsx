import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { lockWallet, type Wallet } from './wallet'
type Session = { wallet: Wallet | null; setWallet: (wallet: Wallet | null) => void }
const Context = createContext<Session | null>(null)
export function WalletBoundary() {
  const [wallet, setValue] = useState<Wallet | null>(null)
  const current = useRef<Wallet | null>(null)
  function setWallet(value: Wallet | null) {
    if (current.current && current.current !== value) lockWallet(current.current)
    current.current = value; setValue(value)
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const lock = () => { if (current.current) lockWallet(current.current); current.current = null; setValue(null) }
    const reset = () => { clearTimeout(timer); if (current.current) timer = setTimeout(lock, 5 * 60 * 1000) }
    const hide = () => { if (document.visibilityState === 'hidden') lock() }
    window.addEventListener('pagehide', lock); document.addEventListener('visibilitychange', hide)
    window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset)
    reset()
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', lock); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset) }
  }, [wallet])
  useEffect(() => () => { if (current.current) lockWallet(current.current); current.current = null }, [])
  return <Context.Provider value={{ wallet, setWallet }}><Outlet /></Context.Provider>
}
export function useWallet() { const value = useContext(Context); if (!value) throw new Error('Wallet session unavailable.'); return value }
