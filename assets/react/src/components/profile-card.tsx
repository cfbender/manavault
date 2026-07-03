import React, { useCallback, useEffect, useMemo, useRef } from "react"
import type { CSSProperties } from "react"
import "./profile-card.css"

const DEFAULT_INNER_GRADIENT =
  "linear-gradient(145deg,color-mix(in oklch, var(--color-primary), transparent 45%) 0%,color-mix(in oklch, var(--color-info), transparent 73%) 100%)"

const ANIMATION_CONFIG = {
  INITIAL_DURATION: 1200,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
  DEVICE_BETA_OFFSET: 20,
  ENTER_TRANSITION_MS: 180,
}

const clamp = (value: number, min = 0, max = 100) => Math.min(Math.max(value, min), max)
const round = (value: number, precision = 3) => Number.parseFloat(value.toFixed(precision))
const adjust = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) =>
  round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin))

const MOBILE_INTERACTION_QUERY =
  "(pointer: coarse), (any-pointer: coarse), (hover: none), (any-hover: none)"

const hasMobileInteraction = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(MOBILE_INTERACTION_QUERY).matches

type ProfileCardProps = {
  avatarUrl?: string
  innerGradient?: string
  behindGlowEnabled?: boolean
  behindGlowColor?: string
  behindGlowSize?: string
  className?: string
  enableTilt?: boolean
  enableMobileTilt?: boolean
  disableTiltOnCoarsePointer?: boolean
  mobileTiltSensitivity?: number
  miniAvatarUrl?: string
  name?: string
  title?: string
  handle?: string
  status?: string
  contactText?: string
  showUserInfo?: boolean
  onContactClick?: () => void
}

type ProfileCardStyle = CSSProperties & Record<`--${string}`, string>

type TiltEngine = {
  setImmediate: (x: number, y: number) => void
  setTarget: (x: number, y: number) => void
  toCenter: () => void
  beginInitial: (durationMs: number) => void
  getCurrent: () => { x: number; y: number; tx: number; ty: number }
  cancel: () => void
}

const ProfileCardComponent = ({
  avatarUrl = "",
  innerGradient,
  behindGlowEnabled = true,
  behindGlowColor,
  behindGlowSize,
  className = "",
  enableTilt = true,
  enableMobileTilt = false,
  mobileTiltSensitivity = 5,
  disableTiltOnCoarsePointer = false,
  miniAvatarUrl,
  name = "Javi A. Torres",
  title = "Software Engineer",
  handle = "javicodes",
  status = "Online",
  contactText = "Contact",
  showUserInfo = true,
  onContactClick,
}: ProfileCardProps) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  const enterTimerRef = useRef<number | null>(null)
  const leaveRafRef = useRef<number | null>(null)

  const tiltEnabled = enableTilt && !(disableTiltOnCoarsePointer && hasMobileInteraction())

  const tiltEngine = useMemo<TiltEngine | null>(() => {
    if (!tiltEnabled) return null

    let rafId: number | null = null
    let running = false
    let lastTs = 0

    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0

    const defaultTau = 0.14
    const initialTau = 0.6
    let initialUntil = 0

    const setVarsFromXY = (x: number, y: number) => {
      const shell = shellRef.current
      const wrap = wrapRef.current
      if (!shell || !wrap) return

      const width = shell.clientWidth || 1
      const height = shell.clientHeight || 1

      const percentX = clamp((100 / width) * x)
      const percentY = clamp((100 / height) * y)

      const centerX = percentX - 50
      const centerY = percentY - 50

      const properties = {
        "--pointer-x": `${percentX}%`,
        "--pointer-y": `${percentY}%`,
        "--background-x": `${adjust(percentX, 0, 100, 35, 65)}%`,
        "--background-y": `${adjust(percentY, 0, 100, 35, 65)}%`,
        "--pointer-from-center": `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        "--pointer-from-top": `${percentY / 100}`,
        "--pointer-from-left": `${percentX / 100}`,
        "--rotate-x": `${round(-(centerX / 5))}deg`,
        "--rotate-y": `${round(centerY / 4)}deg`,
      }

      for (const [key, value] of Object.entries(properties)) wrap.style.setProperty(key, value)
    }

    const step = (timestamp: number) => {
      if (!running) return
      if (lastTs === 0) lastTs = timestamp
      const deltaSeconds = (timestamp - lastTs) / 1000
      lastTs = timestamp

      const tau = timestamp < initialUntil ? initialTau : defaultTau
      const interpolation = 1 - Math.exp(-deltaSeconds / tau)

      currentX += (targetX - currentX) * interpolation
      currentY += (targetY - currentY) * interpolation

      setVarsFromXY(currentX, currentY)

      const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05
      const inInitialTilt = timestamp < initialUntil

      if (stillFar || inInitialTilt) {
        rafId = requestAnimationFrame(step)
      } else {
        running = false
        lastTs = 0
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
      }
    }

    const start = () => {
      if (running) return
      running = true
      lastTs = 0
      rafId = requestAnimationFrame(step)
    }

    return {
      setImmediate(x: number, y: number) {
        currentX = x
        currentY = y
        setVarsFromXY(currentX, currentY)
      },
      setTarget(x: number, y: number) {
        targetX = x
        targetY = y
        start()
      },
      toCenter() {
        const shell = shellRef.current
        if (!shell) return
        this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2)
      },
      beginInitial(durationMs: number) {
        initialUntil = performance.now() + durationMs
        start()
      },
      getCurrent() {
        return { x: currentX, y: currentY, tx: targetX, ty: targetY }
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId)
        rafId = null
        running = false
        lastTs = 0
      },
    }
  }, [tiltEnabled])

  const getOffsets = (event: PointerEvent, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current
      if (!shell || !tiltEngine) return
      const { x, y } = getOffsets(event, shell)
      tiltEngine.setTarget(x, y)
    },
    [tiltEngine],
  )

  const handlePointerEnter = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current
      if (!shell || !tiltEngine) return

      shell.classList.add("active")
      shell.classList.add("entering")
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current)
      enterTimerRef.current = window.setTimeout(() => {
        shell.classList.remove("entering")
      }, ANIMATION_CONFIG.ENTER_TRANSITION_MS)

      const { x, y } = getOffsets(event, shell)
      tiltEngine.setTarget(x, y)
    },
    [tiltEngine],
  )

  const handlePointerLeave = useCallback(() => {
    const shell = shellRef.current
    if (!shell || !tiltEngine) return

    tiltEngine.toCenter()

    const checkSettle = () => {
      const { x, y, tx, ty } = tiltEngine.getCurrent()
      const settled = Math.hypot(tx - x, ty - y) < 0.6
      if (settled) {
        shell.classList.remove("active")
        leaveRafRef.current = null
      } else {
        leaveRafRef.current = requestAnimationFrame(checkSettle)
      }
    }
    if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current)
    leaveRafRef.current = requestAnimationFrame(checkSettle)
  }, [tiltEngine])

  const handleDeviceOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const shell = shellRef.current
      if (!shell || !tiltEngine) return

      const { beta, gamma } = event
      if (beta == null || gamma == null) return

      const centerX = shell.clientWidth / 2
      const centerY = shell.clientHeight / 2
      const x = clamp(centerX + gamma * mobileTiltSensitivity, 0, shell.clientWidth)
      const y = clamp(
        centerY + (beta - ANIMATION_CONFIG.DEVICE_BETA_OFFSET) * mobileTiltSensitivity,
        0,
        shell.clientHeight,
      )

      tiltEngine.setTarget(x, y)
    },
    [tiltEngine, mobileTiltSensitivity],
  )

  useEffect(() => {
    if (!tiltEnabled || !tiltEngine) return

    const shell = shellRef.current
    if (!shell) return

    const pointerMoveHandler = handlePointerMove
    const pointerEnterHandler = handlePointerEnter
    const pointerLeaveHandler = handlePointerLeave
    const deviceOrientationHandler = handleDeviceOrientation

    shell.addEventListener("pointerenter", pointerEnterHandler)
    shell.addEventListener("pointermove", pointerMoveHandler)
    shell.addEventListener("pointerleave", pointerLeaveHandler)

    const handleClick = () => {
      if (!enableMobileTilt || location.protocol !== "https:") return
      const motionEvent = window.DeviceMotionEvent as
        | (typeof DeviceMotionEvent & { requestPermission?: () => Promise<PermissionState> })
        | undefined
      if (motionEvent && typeof motionEvent.requestPermission === "function") {
        motionEvent
          .requestPermission()
          .then((state) => {
            if (state === "granted") {
              window.addEventListener("deviceorientation", deviceOrientationHandler)
            }
          })
          .catch(console.error)
      } else {
        window.addEventListener("deviceorientation", deviceOrientationHandler)
      }
    }
    shell.addEventListener("click", handleClick)

    const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET
    const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET
    tiltEngine.setImmediate(initialX, initialY)
    tiltEngine.toCenter()
    tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION)

    return () => {
      shell.removeEventListener("pointerenter", pointerEnterHandler)
      shell.removeEventListener("pointermove", pointerMoveHandler)
      shell.removeEventListener("pointerleave", pointerLeaveHandler)
      shell.removeEventListener("click", handleClick)
      window.removeEventListener("deviceorientation", deviceOrientationHandler)
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current)
      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current)
      tiltEngine.cancel()
      shell.classList.remove("entering")
    }
  }, [
    tiltEnabled,
    enableMobileTilt,
    tiltEngine,
    handlePointerMove,
    handlePointerEnter,
    handlePointerLeave,
    handleDeviceOrientation,
  ])

  const cardStyle = useMemo<ProfileCardStyle>(
    () => ({
      "--inner-gradient": innerGradient ?? DEFAULT_INNER_GRADIENT,
      "--behind-glow-color": behindGlowColor ?? "rgba(125, 190, 255, 0.67)",
      "--behind-glow-size": behindGlowSize ?? "50%",
    }),
    [innerGradient, behindGlowColor, behindGlowSize],
  )

  const handleContactClick = useCallback(() => {
    onContactClick?.()
  }, [onContactClick])

  return (
    <div ref={wrapRef} className={`pc-card-wrapper ${className}`.trim()} style={cardStyle}>
      {behindGlowEnabled && <div className="pc-behind" />}
      <div ref={shellRef} className="pc-card-shell">
        <section className="pc-card">
          <div className="pc-inside">
            <div className="pc-shine" />
            <div className="pc-glare" />
            <div className="pc-content pc-avatar-content">
              <img
                className="avatar"
                src={avatarUrl}
                alt={`${name || "User"} avatar`}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = "none"
                }}
              />
              {showUserInfo && (
                <div className="pc-user-info">
                  <div className="pc-user-details">
                    <div className="pc-mini-avatar">
                      <img
                        src={miniAvatarUrl || avatarUrl}
                        alt={`${name || "User"} mini avatar`}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.opacity = "0.5"
                          event.currentTarget.src = avatarUrl
                        }}
                      />
                    </div>
                    <div className="pc-user-text">
                      <div className="pc-handle">@{handle}</div>
                      <div className="pc-status">{status}</div>
                    </div>
                  </div>
                  <button
                    className="pc-contact-btn"
                    onClick={handleContactClick}
                    style={{ pointerEvents: "auto" }}
                    type="button"
                    aria-label={`Contact ${name || "user"}`}
                  >
                    {contactText}
                  </button>
                </div>
              )}
            </div>
            <div className="pc-content">
              <div className="pc-details">
                <h3>{name}</h3>
                <p>{title}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const ProfileCard = React.memo(ProfileCardComponent)
export default ProfileCard
