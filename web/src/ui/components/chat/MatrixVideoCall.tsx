import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GroupCallEvent,
  GroupCallIntent,
  GroupCallType,
  type GroupCall,
  type MatrixClient,
} from 'matrix-js-sdk'
import type { CallFeed } from 'matrix-js-sdk/lib/webrtc/callFeed'
import { GroupCallEventHandlerEvent } from 'matrix-js-sdk/lib/webrtc/groupCallEventHandler'

type MatrixVideoCallProps = {
  client: MatrixClient
  roomId: string
  roomName: string
}

export function formatVideoParticipantName(userId: string): string {
  const localPart = userId.split(':')[0]?.replace(/^@/, '') || userId
  return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function VideoTile({ feed }: { feed: CallFeed }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const isLocal = feed.isLocal()
  const cameraOff = feed.isVideoMuted() || feed.stream.getVideoTracks().length === 0

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = feed.stream
    void video.play().catch(() => {})
    return () => { video.srcObject = null }
  }, [feed])

  return (
    <article className={`matrix-video-tile ${cameraOff ? 'camera-off' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      {cameraOff ? (
        <div className="matrix-video-avatar" aria-hidden="true">
          {formatVideoParticipantName(feed.userId).charAt(0) || '?'}
        </div>
      ) : null}
      <div className="matrix-video-tile-label">
        <span>{isLocal ? 'You' : formatVideoParticipantName(feed.userId)}</span>
        {feed.isAudioMuted() ? <span aria-label="Microphone muted">Muted</span> : null}
      </div>
    </article>
  )
}

export function MatrixVideoCall({ client, roomId, roomName }: MatrixVideoCallProps) {
  const [call, setCall] = useState<GroupCall | null>(null)
  const [joined, setJoined] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [feeds, setFeeds] = useState<CallFeed[]>([])
  const [microphoneMuted, setMicrophoneMuted] = useState(false)
  const [cameraMuted, setCameraMuted] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const joinedCallRef = useRef<GroupCall | null>(null)
  const supported = client.supportsVoip()

  useEffect(() => {
    let cancelled = false
    const syncCall = (nextCall: GroupCall | null) => {
      if (cancelled || (nextCall && nextCall.room.roomId !== roomId)) return
      setCall(nextCall)
    }
    const onIncoming = (nextCall: GroupCall) => syncCall(nextCall)
    const onOutgoing = (nextCall: GroupCall) => syncCall(nextCall)
    const onEnded = (endedCall: GroupCall) => {
      if (endedCall.room.roomId !== roomId) return
      if (joinedCallRef.current === endedCall) joinedCallRef.current = null
      setCall(null)
      setJoined(false)
      setPanelOpen(false)
      setFeeds([])
    }

    void client.waitUntilRoomReadyForGroupCalls(roomId).then(() => {
      syncCall(client.getGroupCallForRoom(roomId))
    }).catch(() => {})
    client.on(GroupCallEventHandlerEvent.Incoming, onIncoming)
    client.on(GroupCallEventHandlerEvent.Outgoing, onOutgoing)
    client.on(GroupCallEventHandlerEvent.Ended, onEnded)
    return () => {
      cancelled = true
      client.off(GroupCallEventHandlerEvent.Incoming, onIncoming)
      client.off(GroupCallEventHandlerEvent.Outgoing, onOutgoing)
      client.off(GroupCallEventHandlerEvent.Ended, onEnded)
      joinedCallRef.current?.leave()
      joinedCallRef.current = null
    }
  }, [client, roomId])

  useEffect(() => {
    if (!call) {
      setFeeds([])
      return
    }
    const updateFeeds = () => {
      setFeeds([...call.userMediaFeeds])
      setMicrophoneMuted(call.isMicrophoneMuted())
      setCameraMuted(call.isLocalVideoMuted())
      setScreenSharing(call.isScreensharing())
    }
    updateFeeds()
    call.on(GroupCallEvent.UserMediaFeedsChanged, updateFeeds)
    call.on(GroupCallEvent.LocalMuteStateChanged, updateFeeds)
    call.on(GroupCallEvent.LocalScreenshareStateChanged, updateFeeds)
    return () => {
      call.off(GroupCallEvent.UserMediaFeedsChanged, updateFeeds)
      call.off(GroupCallEvent.LocalMuteStateChanged, updateFeeds)
      call.off(GroupCallEvent.LocalScreenshareStateChanged, updateFeeds)
    }
  }, [call])

  const orderedFeeds = useMemo(
    () => [...feeds].sort((left, right) => Number(right.isLocal()) - Number(left.isLocal())),
    [feeds],
  )

  async function enterCall() {
    setBusy(true)
    setError(null)
    let targetCall = call
    let created = false
    try {
      await client.waitUntilRoomReadyForGroupCalls(roomId)
      targetCall = client.getGroupCallForRoom(roomId)
      if (!targetCall) {
        targetCall = await client.createGroupCall(roomId, GroupCallType.Video, false, GroupCallIntent.Room)
        created = true
      }
      setCall(targetCall)
      await targetCall.enter()
      joinedCallRef.current = targetCall
      setJoined(true)
      setPanelOpen(true)
      setFeeds([...targetCall.userMediaFeeds])
      setMicrophoneMuted(targetCall.isMicrophoneMuted())
      setCameraMuted(targetCall.isLocalVideoMuted())
    } catch (cause) {
      if (created && targetCall) await targetCall.terminate().catch(() => {})
      setError(cause instanceof Error ? cause.message : 'Unable to start the video call.')
      setPanelOpen(true)
    } finally {
      setBusy(false)
    }
  }

  function leaveCall() {
    call?.leave()
    joinedCallRef.current = null
    setJoined(false)
    setPanelOpen(false)
    setFeeds([])
  }

  async function endCall() {
    if (!call) return
    setBusy(true)
    setError(null)
    try {
      await call.terminate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to end the call.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleMicrophone() {
    if (!call) return
    const changed = await call.setMicrophoneMuted(!microphoneMuted)
    if (changed) setMicrophoneMuted(!microphoneMuted)
  }

  async function toggleCamera() {
    if (!call) return
    const changed = await call.setLocalVideoMuted(!cameraMuted)
    if (changed) setCameraMuted(!cameraMuted)
  }

  async function toggleScreenSharing() {
    if (!call) return
    const changed = await call.setScreensharingEnabled(!screenSharing)
    setScreenSharing(changed)
  }

  const buttonLabel = joined ? 'Return to call' : call ? 'Join video call' : 'Start video call'

  return (
    <>
      <button
        type="button"
        className={`portal-chat-video-btn ${call ? 'active' : ''}`}
        disabled={!supported || busy}
        title={supported ? buttonLabel : 'Video calling is not supported in this browser'}
        onClick={() => joined ? setPanelOpen(true) : void enterCall()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.75A2.75 2.75 0 0 1 6.75 4h7.5A2.75 2.75 0 0 1 17 6.75v1.7l3.15-1.8A1.25 1.25 0 0 1 22 7.74v8.52a1.25 1.25 0 0 1-1.85 1.09L17 15.55v1.7A2.75 2.75 0 0 1 14.25 20h-7.5A2.75 2.75 0 0 1 4 17.25v-10.5Z" />
        </svg>
        <span>{buttonLabel}</span>
      </button>

      {panelOpen ? (
        <section className="matrix-video-overlay" role="dialog" aria-modal="true" aria-label={`${roomName} video call`}>
          <header className="matrix-video-header">
            <div>
              <p>Video call</p>
              <h2>{roomName}</h2>
            </div>
            {joined ? (
              <button className="matrix-video-minimize" type="button" onClick={() => setPanelOpen(false)} aria-label="Minimize call">
                Minimize
              </button>
            ) : null}
          </header>

          <div className={`matrix-video-grid participants-${Math.min(orderedFeeds.length, 4)}`}>
            {orderedFeeds.length > 0
              ? orderedFeeds.map((feed) => <VideoTile key={`${feed.userId}-${feed.deviceId}-${feed.stream.id}`} feed={feed} />)
              : <div className="matrix-video-empty">Waiting for participants…</div>}
          </div>

          {error ? <p className="matrix-video-error" role="alert">{error}</p> : null}

          <footer className="matrix-video-controls">
            {joined ? (
              <>
                <button type="button" className={microphoneMuted ? 'off' : ''} onClick={() => void toggleMicrophone()}>
                  {microphoneMuted ? 'Unmute' : 'Mute'}
                </button>
                <button type="button" className={cameraMuted ? 'off' : ''} onClick={() => void toggleCamera()}>
                  {cameraMuted ? 'Camera on' : 'Camera off'}
                </button>
                <button type="button" className={screenSharing ? 'active' : ''} onClick={() => void toggleScreenSharing()}>
                  {screenSharing ? 'Stop sharing' : 'Share screen'}
                </button>
                <button type="button" className="danger" onClick={leaveCall}>Leave</button>
                <button type="button" className="danger secondary" disabled={busy} onClick={() => void endCall()}>End for everyone</button>
              </>
            ) : (
              <>
                <button type="button" className="primary" disabled={busy} onClick={() => void enterCall()}>
                  {busy ? 'Connecting…' : 'Join with camera'}
                </button>
                <button type="button" onClick={() => setPanelOpen(false)}>Close</button>
              </>
            )}
          </footer>
        </section>
      ) : null}
    </>
  )
}
