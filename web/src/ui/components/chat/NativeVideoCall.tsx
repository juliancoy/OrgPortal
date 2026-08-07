import { useEffect, useRef, useState } from 'react'

type CallSignal = {
  type: 'call.signal'
  conversation_id: string
  call_id: string
  signal: 'invite' | 'offer' | 'answer' | 'ice' | 'hangup'
  from_user_id: string
  from_user_name?: string
  target_user_id?: string
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

type NativeVideoCallProps = {
  socket: WebSocket | null
  conversationId: string
  conversationName: string
  currentUserId: string
  otherUserId: string
  otherUserName: string
  loadIceServers: () => Promise<RTCIceServer[]>
}

type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'connected'

function StreamVideo({ stream, muted, label }: { stream: MediaStream | null; muted: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    if (stream) void ref.current.play().catch(() => {})
    return () => { if (ref.current) ref.current.srcObject = null }
  }, [stream])
  return (
    <article className={`matrix-video-tile ${stream?.getVideoTracks().some((track) => track.enabled) ? '' : 'camera-off'}`}>
      <video ref={ref} autoPlay playsInline muted={muted} />
      {!stream?.getVideoTracks().some((track) => track.enabled) ? (
        <div className="matrix-video-avatar" aria-hidden="true">{label.charAt(0).toUpperCase() || '?'}</div>
      ) : null}
      <div className="matrix-video-tile-label"><span>{label}</span></div>
    </article>
  )
}

export function NativeVideoCall(props: NativeVideoCallProps) {
  const { socket, conversationId, conversationName, currentUserId, otherUserId, otherUserName, loadIceServers } = props
  const [phase, setPhase] = useState<CallPhase>('idle')
  const [panelOpen, setPanelOpen] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [microphoneMuted, setMicrophoneMuted] = useState(false)
  const [cameraMuted, setCameraMuted] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteUserIdRef = useRef(otherUserId)
  const callIdRef = useRef('')
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  const [offerReady, setOfferReady] = useState(false)

  useEffect(() => { remoteUserIdRef.current = otherUserId }, [otherUserId])

  function sendSignal(signal: CallSignal['signal'], extra: Partial<CallSignal> = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN || !callIdRef.current) return
    socket.send(JSON.stringify({
      type: 'call.signal',
      conversation_id: conversationId,
      call_id: callIdRef.current,
      signal,
      target_user_id: remoteUserIdRef.current,
      ...extra,
    }))
  }

  function stopMedia() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    peerRef.current?.close()
    peerRef.current = null
    pendingOfferRef.current = null
    pendingCandidatesRef.current = []
    setMicrophoneMuted(false)
    setCameraMuted(false)
    setScreenSharing(false)
    screenTrackRef.current?.stop()
    screenTrackRef.current = null
    setOfferReady(false)
  }

  function resetCall() {
    stopMedia()
    callIdRef.current = ''
    setPhase('idle')
    setPanelOpen(false)
  }

  async function createPeer(): Promise<RTCPeerConnection> {
    if (peerRef.current) return peerRef.current
    const iceServers = await loadIceServers().catch(() => [{ urls: ['stun:stun.cloudflare.com:3478'] }])
    const peer = new RTCPeerConnection({ iceServers })
    peerRef.current = peer
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal('ice', { candidate: event.candidate.toJSON() })
    }
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track])
      setRemoteStream(stream)
      setPhase('connected')
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setPhase('connected')
      if (peer.connectionState === 'failed') setError('The video connection failed. Leave and try again.')
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    })
    localStreamRef.current = stream
    setLocalStream(stream)
    for (const track of stream.getTracks()) peer.addTrack(track, stream)
    return peer
  }

  async function addPendingCandidates(peer: RTCPeerConnection) {
    for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate)
  }

  async function startCall() {
    setError(null)
    setPhase('outgoing')
    setPanelOpen(true)
    const nextCallId = crypto.randomUUID()
    callIdRef.current = nextCallId
    try {
      const peer = await createPeer()
      sendSignal('invite')
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      sendSignal('offer', { description: offer })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Camera or microphone access failed.')
      stopMedia()
    }
  }

  async function acceptCall() {
    setError(null)
    try {
      const peer = await createPeer()
      const offer = pendingOfferRef.current
      if (!offer) throw new Error('The caller has not finished connecting yet. Try again in a moment.')
      await peer.setRemoteDescription(offer)
      await addPendingCandidates(peer)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      sendSignal('answer', { description: answer })
      setPhase('connected')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to join the video call.')
    }
  }

  function hangUp(notify = true) {
    if (notify) sendSignal('hangup')
    resetCall()
  }

  useEffect(() => {
    if (!socket) return
    const handleSignal = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      let signal: CallSignal
      try { signal = JSON.parse(event.data) as CallSignal } catch { return }
      if (signal.type !== 'call.signal' || signal.conversation_id !== conversationId) return
      if (signal.from_user_id === currentUserId || (signal.target_user_id && signal.target_user_id !== currentUserId)) return
      if (callIdRef.current && signal.call_id !== callIdRef.current) return
      if (signal.signal === 'invite') {
        if (callIdRef.current && signal.call_id >= callIdRef.current) return
        if (callIdRef.current) stopMedia()
        callIdRef.current = signal.call_id
        remoteUserIdRef.current = signal.from_user_id
        setPhase('incoming')
        setPanelOpen(true)
        setError(null)
        return
      }
      if (!callIdRef.current) return
      if (signal.signal === 'offer' && signal.description) {
        pendingOfferRef.current = signal.description
        setOfferReady(true)
        return
      }
      if (signal.signal === 'answer' && signal.description) {
        void (async () => {
          const peer = peerRef.current
          if (!peer) return
          await peer.setRemoteDescription(signal.description!)
          await addPendingCandidates(peer)
        })().catch((cause) => setError(cause instanceof Error ? cause.message : 'Call negotiation failed.'))
        return
      }
      if (signal.signal === 'ice' && signal.candidate) {
        const peer = peerRef.current
        if (peer?.remoteDescription) void peer.addIceCandidate(signal.candidate).catch(() => {})
        else pendingCandidatesRef.current.push(signal.candidate)
        return
      }
      if (signal.signal === 'hangup') resetCall()
    }
    socket.addEventListener('message', handleSignal)
    return () => socket.removeEventListener('message', handleSignal)
  }, [socket, conversationId, currentUserId])

  useEffect(() => () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    peerRef.current?.close()
  }, [])

  function toggleMicrophone() {
    const next = !microphoneMuted
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMicrophoneMuted(next)
  }

  function toggleCamera() {
    const next = !cameraMuted
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next })
    setCameraMuted(next)
  }

  async function toggleScreenSharing() {
    const peer = peerRef.current
    const stream = localStreamRef.current
    if (!peer || !stream) return
    if (screenSharing) {
      const cameraTrack = stream.getVideoTracks()[0]
      const sender = peer.getSenders().find((item) => item.track?.kind === 'video')
      if (cameraTrack && sender) await sender.replaceTrack(cameraTrack)
      screenTrackRef.current?.stop()
      screenTrackRef.current = null
      setScreenSharing(false)
      return
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = display.getVideoTracks()[0]
      const sender = peer.getSenders().find((item) => item.track?.kind === 'video')
      if (!screenTrack || !sender) return
      await sender.replaceTrack(screenTrack)
      screenTrackRef.current = screenTrack
      setScreenSharing(true)
      screenTrack.addEventListener('ended', () => {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0]
        const activeSender = peerRef.current?.getSenders().find((item) => item.track?.kind === 'video')
        if (cameraTrack && activeSender) void activeSender.replaceTrack(cameraTrack)
        screenTrackRef.current = null
        setScreenSharing(false)
      }, { once: true })
    } catch {
      // The user canceled the browser screen picker.
    }
  }

  const supported = typeof RTCPeerConnection !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const connected = phase === 'connected'
  return (
    <>
      <button
        type="button"
        className={`portal-chat-video-btn ${phase !== 'idle' ? 'active' : ''}`}
        disabled={!supported || !socket || socket.readyState !== WebSocket.OPEN}
        onClick={() => phase === 'idle' ? void startCall() : setPanelOpen(true)}
        title={supported ? 'Start a private video call' : 'Video calling is not supported in this browser'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.75A2.75 2.75 0 0 1 6.75 4h7.5A2.75 2.75 0 0 1 17 6.75v1.7l3.15-1.8A1.25 1.25 0 0 1 22 7.74v8.52a1.25 1.25 0 0 1-1.85 1.09L17 15.55v1.7A2.75 2.75 0 0 1 14.25 20h-7.5A2.75 2.75 0 0 1 4 17.25v-10.5Z" /></svg>
        <span>{phase === 'idle' ? 'Video call' : 'Return to call'}</span>
      </button>
      {panelOpen ? (
        <section className="matrix-video-overlay" role="dialog" aria-modal="true" aria-label={`${conversationName} video call`}>
          <header className="matrix-video-header">
            <div><p>Private video call</p><h2>{conversationName}</h2></div>
            {phase !== 'incoming' ? <button className="matrix-video-minimize" type="button" onClick={() => setPanelOpen(false)}>Minimize</button> : null}
          </header>
          <div className={`matrix-video-grid participants-${remoteStream ? 2 : 1}`}>
            {localStream ? <StreamVideo stream={localStream} muted label="You" /> : null}
            {remoteStream ? <StreamVideo stream={remoteStream} muted={false} label={otherUserName} /> : (
              <div className="matrix-video-empty">
                {phase === 'incoming' ? `${otherUserName} is calling…` : `Waiting for ${otherUserName}…`}
              </div>
            )}
          </div>
          {error ? <p className="matrix-video-error" role="alert">{error}</p> : null}
          <footer className="matrix-video-controls">
            {phase === 'incoming' && !localStream ? (
              <><button className="primary" type="button" disabled={!offerReady} onClick={() => void acceptCall()}>{offerReady ? 'Answer' : 'Connecting…'}</button><button className="danger" type="button" onClick={() => hangUp()}>Decline</button></>
            ) : (
              <>
                <button className={microphoneMuted ? 'off' : ''} type="button" onClick={toggleMicrophone}>{microphoneMuted ? 'Unmute' : 'Mute'}</button>
                <button className={cameraMuted ? 'off' : ''} type="button" onClick={toggleCamera}>{cameraMuted ? 'Camera on' : 'Camera off'}</button>
                <button className={screenSharing ? 'active' : ''} type="button" disabled={!connected} onClick={() => void toggleScreenSharing()}>{screenSharing ? 'Stop sharing' : 'Share screen'}</button>
                <button className="danger" type="button" onClick={() => hangUp()}>Leave</button>
              </>
            )}
          </footer>
        </section>
      ) : null}
    </>
  )
}
