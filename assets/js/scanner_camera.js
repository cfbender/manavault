const IMAGE_MIME_TYPE = "image/jpeg"
const IMAGE_QUALITY = 0.82
const MAX_CAPTURE_EDGE_PX = 1200
const CAPTURE_INTERVAL_MS = 450
const CAPTURE_COOLDOWN_MS = 400

function createScannerCamera() {
  let stream = null
  let devices = []
  let deviceIndex = 0
  let torchEnabled = false
  let captureTimer = null
  let captureInFlight = false
  let lastCaptureAt = 0
  let forceNextCapture = false
  let audioCtx = null

  let videoEl = null
  let canvasEl = null
  let statusEl = null
  let previewEl = null
  let switchBtn = null
  let torchBtn = null
  let zoomCtrl = null
  let zoomInp = null
  let zoomVal = null
  let pushEventFn = null
  let handleEventFn = null

  // ---- helpers (no this) ----

  function setStatus(message) {
    const span = statusEl?.querySelector("span")
    if (span) span.textContent = message
    pushEventFn("camera_status", {message})
  }

  function reportError(message) {
    captureInFlight = false
    setStatus(message)
    pushEventFn("camera_error", {message})
  }

  function cameraErrorMessage(error) {
    if (error?.name === "NotAllowedError") return "Camera permission was denied."
    if (error?.name === "NotFoundError") return "No camera was found on this device."
    if (error?.name === "NotReadableError") return "Camera is already in use by another app."
    if (error?.name === "OverconstrainedError") return "Requested camera is not available."
    return "Camera could not be started."
  }

  function currentVideoTrack() {
    return stream?.getVideoTracks()[0]
  }

  function cameraConstraints() {
    const device = devices[deviceIndex]
    if (device?.deviceId) {
      return {deviceId: {exact: device.deviceId}}
    }
    return {facingMode: {ideal: "environment"}}
  }

  function updateSwitchControl() {
    if (!switchBtn) return
    switchBtn.disabled = devices.length < 2
    switchBtn.classList.toggle("btn-disabled", devices.length < 2)
  }

  function updateCapabilityControls(capabilities) {
    const torchSupported = Boolean(capabilities.torch)
    if (torchBtn) {
      torchBtn.disabled = !torchSupported
      torchBtn.classList.toggle("btn-disabled", !torchSupported)
      torchBtn.classList.toggle("btn-active", torchEnabled && torchSupported)
    }

    if (zoomCtrl && zoomInp) {
      if (capabilities.zoom) {
        const {min, max, step} = capabilities.zoom
        zoomInp.min = min
        zoomInp.max = max
        zoomInp.step = step || 0.1
        zoomInp.value = min
        if (zoomVal) zoomVal.textContent = min
        zoomCtrl.classList.remove("hidden")
      } else {
        zoomCtrl.classList.add("hidden")
      }
    }
  }

  function updateCapabilities() {
    const track = currentVideoTrack()
    const capabilities = track?.getCapabilities ? track.getCapabilities() : {}
    updateCapabilityControls(capabilities || {})
  }

  function disableControls() {
    ;[switchBtn, torchBtn, zoomInp].filter(Boolean).forEach(control => {
      control.disabled = true
      control.classList.add("btn-disabled")
    })
  }

  // ---- audio ----

  async function unlockAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return false

    audioCtx = audioCtx || new AudioContext()

    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume()
      } catch (_error) {
        return false
      }
    }

    return audioCtx.state === "running"
  }

  async function playDing() {
    if (!(await unlockAudio())) return

    const oscillator = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18)

    oscillator.connect(gain)
    gain.connect(audioCtx.destination)
    oscillator.start()
    oscillator.stop(audioCtx.currentTime + 0.2)
  }

  // ---- camera lifecycle ----

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return

    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      devices = all.filter(d => d.kind === "videoinput")
      updateSwitchControl()
    } catch (_error) {
      devices = []
      updateSwitchControl()
    }
  }

  function stopAutoCapture() {
    if (captureTimer) {
      window.clearInterval(captureTimer)
      captureTimer = null
    }
  }

  function stopCamera() {
    stopAutoCapture()

    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }

    if (videoEl) videoEl.srcObject = null
    torchEnabled = false
    updateCapabilityControls({})
  }

  function captureFrame() {
    if (captureInFlight) return

    const now = Date.now()
    if (now - lastCaptureAt < CAPTURE_COOLDOWN_MS) return
    if (!stream || !videoEl?.videoWidth || !videoEl?.videoHeight) return

    captureInFlight = true
    lastCaptureAt = now

    const scale = Math.min(1, MAX_CAPTURE_EDGE_PX / Math.max(videoEl.videoWidth, videoEl.videoHeight))
    canvasEl.width = Math.round(videoEl.videoWidth * scale)
    canvasEl.height = Math.round(videoEl.videoHeight * scale)

    const context = canvasEl.getContext("2d")
    context.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height)

    const imageData = canvasEl.toDataURL(IMAGE_MIME_TYPE, IMAGE_QUALITY)

    pushEventFn("capture", {
      image_data: imageData,
      force: forceNextCapture
    })
    setStatus("Captured frame. Sending to OCR…")
  }

  function startAutoCapture() {
    stopAutoCapture()
    captureTimer = window.setInterval(captureFrame, CAPTURE_INTERVAL_MS)
    window.setTimeout(captureFrame, 400)
  }

  async function startCamera() {
    stopCamera()

    try {
      const constraints = cameraConstraints()
      stream = await navigator.mediaDevices.getUserMedia({video: constraints, audio: false})
      videoEl.srcObject = stream
      await videoEl.play()
      await refreshDevices()
      updateCapabilities()
      setStatus("Camera is running. OCR scanning…")
      startAutoCapture()
    } catch (error) {
      reportError(cameraErrorMessage(error))
    }
  }

  async function switchCamera() {
    if (devices.length < 2) {
      setStatus("No alternate camera is available.")
      return
    }

    deviceIndex = (deviceIndex + 1) % devices.length
    await startCamera()
  }

  function forceDetection() {
    forceNextCapture = true
    setStatus("Force scanning the preview once…")
    captureFrame()
  }

  async function toggleTorch() {
    const track = currentVideoTrack()
    if (!track) return

    try {
      torchEnabled = !torchEnabled
      await track.applyConstraints({advanced: [{torch: torchEnabled}]})
      torchBtn.classList.toggle("btn-active", torchEnabled)
      setStatus(torchEnabled ? "Flashlight enabled." : "Flashlight disabled.")
    } catch (_error) {
      reportError("Flashlight control is not supported by this camera.")
    }
  }

  async function setZoom(value) {
    const track = currentVideoTrack()
    if (!track) return

    try {
      await track.applyConstraints({advanced: [{zoom: Number(value)}]})
      if (zoomVal) zoomVal.textContent = value
    } catch (_error) {
      reportError("Zoom control is not supported by this camera.")
    }
  }

  // ---- audio unlock on first user gesture ----

  function onUserGesture() {
    unlockAudio()
  }

  // ---- hook API ----

  function mounted() {
    // reset mutable state for re-mounts
    stream = null
    devices = []
    deviceIndex = 0
    torchEnabled = false
    captureTimer = null
    captureInFlight = false
    lastCaptureAt = 0
    forceNextCapture = false
    audioCtx = null

    pushEventFn = (event, payload) => this.pushEvent(event, payload)
    handleEventFn = (event, callback) => this.handleEvent(event, callback)

    videoEl = this.el.querySelector("[data-scanner-video]")
    canvasEl = this.el.querySelector("[data-scanner-canvas]")
    statusEl = this.el.querySelector("[data-scanner-status]")
    previewEl = this.el.querySelector("[data-scanner-preview]")
    switchBtn = this.el.querySelector("[data-scanner-switch]")
    torchBtn = this.el.querySelector("[data-scanner-torch]")
    zoomCtrl = this.el.querySelector("[data-scanner-zoom-control]")
    zoomInp = this.el.querySelector("[data-scanner-zoom]")
    zoomVal = this.el.querySelector("[data-scanner-zoom-value]")

    previewEl?.addEventListener("click", forceDetection)
    switchBtn?.addEventListener("click", switchCamera)
    torchBtn?.addEventListener("click", toggleTorch)
    zoomInp?.addEventListener("input", event => setZoom(event.target.value))
    window.addEventListener("pointerdown", onUserGesture, {once: true})
    window.addEventListener("keydown", onUserGesture, {once: true})
    window.addEventListener("touchstart", onUserGesture, {once: true})

    handleEventFn("scan_accepted", () => {
      captureInFlight = false
      forceNextCapture = false
      playDing()
    })

    handleEventFn("scan_duplicate", () => {
      captureInFlight = false
      forceNextCapture = false
    })

    handleEventFn("scan_rejected", () => {
      captureInFlight = false
      forceNextCapture = false
    })

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      reportError("This browser does not support camera capture.")
      disableControls()
      return
    }

    setStatus("Starting camera…")
    refreshDevices().finally(startCamera)
  }

  function destroyed() {
    window.removeEventListener("pointerdown", onUserGesture)
    window.removeEventListener("keydown", onUserGesture)
    window.removeEventListener("touchstart", onUserGesture)
    stopAutoCapture()
    stopCamera()
  }

  return {mounted, destroyed}
}

const ScannerCamera = createScannerCamera()
export default ScannerCamera
