import { useEffect, useRef, useState } from 'react'
import { CHAT_ENCRYPTION_LABELS, type ChatEncryptionMode, type ChatSecurity } from '../../../../../shared/chatEncryption'
import type { NativeChatApi } from '../../../chat/nativeChatApi'

export function ChatEncryptionBadge({ mode, compact = false }: { mode: ChatEncryptionMode; compact?: boolean }) {
  const descriptor = CHAT_ENCRYPTION_LABELS[mode]
  return <span className={`chat-encryption-badge chat-encryption-${descriptor.color}`} title={descriptor.description}>
    <span aria-hidden="true">{mode === 'none' ? '○' : '●'}</span>
    {compact ? mode === 'none' ? 'Not encrypted' : mode === 'rsa' ? 'RSA' : 'RSA + ML-KEM' : descriptor.label}
  </span>
}

export function ChatSecurityControls({ api, conversationId, initialMode = 'none', onChange, onKeysForgotten, onPendingChange }: {
  api: NativeChatApi; conversationId: string; initialMode?: ChatEncryptionMode
  onPendingChange?: (mode: ChatEncryptionMode | null) => void
  onChange?: (security: ChatSecurity) => void; onKeysForgotten?: () => void
}) {
  const [security, setSecurity] = useState<ChatSecurity | null>(null)
  const [choice, setChoice] = useState<ChatEncryptionMode>(initialMode)
  const [status, setStatus] = useState('Checking chat protection…')
  const [error, setError] = useState('')
  const [confirmForget, setConfirmForget] = useState(false)
  const [forgotten, setForgotten] = useState(false)
  const desired = useRef<ChatEncryptionMode | null>(null), saving = useRef(false), alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbacks = useRef({ onChange, onKeysForgotten, onPendingChange }); callbacks.current = { onChange, onKeysForgotten, onPendingChange }
  const forgottenRef = useRef(false)
  const refreshGeneration = useRef(0)

  function applied(next: ChatSecurity) {
    if (!alive.current) return
    setSecurity(next)
    if (desired.current === null) setChoice(next.mode)
    callbacks.current.onChange?.(next)
  }
  useEffect(() => {
    alive.current = true
    let refreshing = false
    async function refresh() {
      if (refreshing || saving.current || document.visibilityState === 'hidden') return
      refreshing = true
      const generation = ++refreshGeneration.current
      try {
        const next = forgottenRef.current ? await api.getSecurity(conversationId) : await api.prepareEncryption(conversationId)
        if (alive.current && generation === refreshGeneration.current) { applied(next); if (desired.current === null) { setError(''); setStatus('') } }
      } catch (failure) { if (alive.current && generation === refreshGeneration.current) { setError(failure instanceof Error ? failure.message : 'Chat protection could not be checked.'); setStatus('') } }
      finally { refreshing = false }
    }
    void refresh()
    const interval = setInterval(() => { void refresh() }, 15000)
    return () => { alive.current = false; ++refreshGeneration.current; clearInterval(interval); if (timer.current) clearTimeout(timer.current) }
  }, [api, conversationId])

  async function save() {
    if (saving.current || desired.current === null) return
    const target = desired.current
    const generation = ++refreshGeneration.current
    saving.current = true; setStatus('Saving chat protection…'); setError('')
    try {
      const next = await api.setEncryption(conversationId, target)
      if (!alive.current || generation !== refreshGeneration.current) return
      if (desired.current === target) { desired.current = null; callbacks.current.onPendingChange?.(null) }
      applied(next)
      setStatus(desired.current === null ? 'Saved' : 'Changes pending…')
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : 'Chat protection could not be saved.'); setStatus('Not saved') } }
    finally { saving.current = false }
    if (alive.current && desired.current !== null && desired.current !== target) void save()
  }
  function choose(next: ChatEncryptionMode) {
    callbacks.current.onPendingChange?.(next)
    setChoice(next); desired.current = next; setStatus('Changes pending…'); setError('')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, 400)
  }
  async function forget() {
    ++refreshGeneration.current
    setError(''); setStatus('Removing this browser’s keys…')
    try {
      await api.forgetEncryptionDevice(conversationId)
      forgottenRef.current = true; setForgotten(true); setConfirmForget(false)
      applied(await api.getSecurity(conversationId)); setStatus('Browser keys removed')
      callbacks.current.onKeysForgotten?.()
    } catch (failure) { setStatus('Not removed'); setError(failure instanceof Error ? failure.message : 'Keys could not be removed.') }
  }
  async function setup() {
    ++refreshGeneration.current
    setStatus('Preparing this browser…'); setError('')
    try {
      const next = await api.prepareEncryption(conversationId, true)
      forgottenRef.current = false; setForgotten(false); applied(next); setStatus('Browser ready')
    } catch (failure) { setStatus(''); setError(failure instanceof Error ? failure.message : 'Browser setup failed.') }
  }
  const mode = security?.mode || initialMode
  return <section className="chat-security-controls" aria-label="Chat encryption">
    <ChatEncryptionBadge mode={mode} />
    <details>
      <summary>Chat protection</summary>
      <div className="chat-security-settings">
        {security?.can_manage ? <label>Encryption for new messages
          <select aria-label="Encryption for new messages" value={choice} onChange={event => choose(event.target.value as ChatEncryptionMode)}>
            <option value="none">Blue · Not end-to-end encrypted</option>
            <option value="rsa">Green · RSA encryption</option>
            <option value="rsa-mlkem">Purple · RSA + ML-KEM (Kyber)</option>
          </select>
        </label> : <p>Only a current chat administrator can change this setting.</p>}
        <p>{CHAT_ENCRYPTION_LABELS[mode].description}</p>
        <p className="chat-security-legend"><span className="chat-encryption-blue">Blue: not encrypted</span><span className="chat-encryption-green">Green: RSA</span><span className="chat-encryption-purple">Purple: RSA + ML-KEM</span></p>
        {mode !== 'none' && <>
          <p>Keys stay in this browser. A new browser cannot read earlier encrypted messages. Chat membership and message metadata remain visible to the service.</p>
          <p>This experimental protocol uses the service’s device directory. It has not had an independent security audit or identity-key verification. Calls and earlier messages are not covered.</p>
        </>}
        {!forgotten && security?.devices.some(device => device.user_id === security.current_user_id) && <button type="button" className="portal-button-secondary" onClick={() => setConfirmForget(true)}>Forget this browser’s encryption keys</button>}
        {forgotten && <button type="button" className="portal-button-secondary" onClick={() => { void setup() }}>Set up this browser again</button>}
        {confirmForget && <div role="alertdialog" aria-label="Forget browser encryption keys">
          <p>This browser will lose access to its earlier encrypted messages. Other browsers and recipients keep their copies.</p>
          <button type="button" className="portal-button-secondary" onClick={() => setConfirmForget(false)}>Keep keys</button>
          <button type="button" className="portal-button-secondary" onClick={() => { void forget() }}>Forget keys</button>
        </div>}
        <span role="status" aria-live="polite">{status}</span>
        {error && <p role="alert">{error} {desired.current !== null && <button type="button" onClick={() => { void save() }}>Retry protection change</button>}</p>}
      </div>
    </details>
    {security && mode !== 'none' && security.missing_members.length > 0 && <p className="chat-security-wait" role="status">Waiting for {security.missing_members.length} {security.missing_members.length === 1 ? 'member' : 'members'} to open this chat and set up encryption. You can queue messages while waiting.</p>}
  </section>
}
