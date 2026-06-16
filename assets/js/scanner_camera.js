const IMAGE_MIME_TYPE = "image/jpeg"
const IMAGE_QUALITY = 0.92

const ScannerCamera = {
  mounted() {
    this.stream = null
    this.devices = []
    this.deviceIndex = 0
    this.torchEnabled = false

    this.video = this.el.querySelector("[data-scanner-video]")
    this.canvas = this.el.querySelector("[data-scanner-canvas]")
    this.status = this.el.querySelector("[data-scanner-status]")
    this.startButton = this.el.querySelector("[data-scanner-start]")
    this.stopButton = this.el.querySelector("[data-scanner-stop]")
    this.captureButton = this.el.querySelector("[data-scanner-capture]")
    this.switchButton = this.el.querySelector("[data-scanner-switch]")
    this.torchButton = this.el.querySelector("[data-scanner-torch]")
    this.zoomControl = this.el.querySelector("[data-scanner-zoom-control]")
    this.zoomInput = this.el.querySelector("[data-scanner-zoom]")
    this.zoomValue = this.el.querySelector("[data-scanner-zoom-value]")

    this.startButton?.addEventListener("click", () => this.startCamera())
    this.stopButton?.addEventListener("click", () => this.stopCamera())
    this.captureButton?.addEventListener("click", () => this.captureFrame())
    this.switchButton?.addEventListener("click", () => this.switchCamera())
    this.torchButton?.addEventListener("click", () => this.toggleTorch())
    this.zoomInput?.addEventListener("input", event => this.setZoom(event.target.value))

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.reportError("This browser does not support camera capture.")
      this.disableControls()
      return
    }

    this.setStatus("Camera is ready to start.")
    this.refreshDevices()
  },

  destroyed() {
    this.stopCamera()
  },

  async refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      this.devices = devices.filter(device => device.kind === "videoinput")
      this.updateSwitchControl()
    } catch (_error) {
      this.devices = []
      this.updateSwitchControl()
    }
  },

  async startCamera() {
    this.stopCamera()

    try {
      const constraints = this.cameraConstraints()
      this.stream = await navigator.mediaDevices.getUserMedia({video: constraints, audio: false})
      this.video.srcObject = this.stream
      await this.video.play()
      await this.refreshDevices()
      this.updateCapabilities()
      this.setStatus("Camera is running.")
    } catch (error) {
      this.reportError(this.cameraErrorMessage(error))
    }
  },

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    if (this.video) this.video.srcObject = null
    this.torchEnabled = false
    this.updateCapabilityControls({})
    this.setStatus("Camera is stopped.")
  },

  async switchCamera() {
    if (this.devices.length < 2) {
      this.setStatus("No alternate camera is available.")
      return
    }

    this.deviceIndex = (this.deviceIndex + 1) % this.devices.length
    await this.startCamera()
  },

  captureFrame() {
    if (!this.stream || !this.video?.videoWidth || !this.video?.videoHeight) {
      this.reportError("Start the camera before capturing a card.")
      return
    }

    this.canvas.width = this.video.videoWidth
    this.canvas.height = this.video.videoHeight

    const context = this.canvas.getContext("2d")
    context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)

    const imageData = this.canvas.toDataURL(IMAGE_MIME_TYPE, IMAGE_QUALITY)
    this.pushEvent("capture", {image_data: imageData})
    this.setStatus("Captured still image. Saving…")
  },

  async toggleTorch() {
    const track = this.currentVideoTrack()
    if (!track) return

    try {
      this.torchEnabled = !this.torchEnabled
      await track.applyConstraints({advanced: [{torch: this.torchEnabled}]})
      this.torchButton.classList.toggle("btn-active", this.torchEnabled)
      this.setStatus(this.torchEnabled ? "Torch enabled." : "Torch disabled.")
    } catch (_error) {
      this.reportError("Torch control is not supported by this camera.")
    }
  },

  async setZoom(value) {
    const track = this.currentVideoTrack()
    if (!track) return

    try {
      await track.applyConstraints({advanced: [{zoom: Number(value)}]})
      if (this.zoomValue) this.zoomValue.textContent = value
    } catch (_error) {
      this.reportError("Zoom control is not supported by this camera.")
    }
  },

  cameraConstraints() {
    const device = this.devices[this.deviceIndex]

    if (device?.deviceId) {
      return {deviceId: {exact: device.deviceId}}
    }

    return {facingMode: {ideal: "environment"}}
  },

  updateCapabilities() {
    const track = this.currentVideoTrack()
    const capabilities = track?.getCapabilities ? track.getCapabilities() : {}
    this.updateCapabilityControls(capabilities || {})
  },

  updateCapabilityControls(capabilities) {
    const torchSupported = Boolean(capabilities.torch)
    if (this.torchButton) {
      this.torchButton.disabled = !torchSupported
      this.torchButton.classList.toggle("btn-disabled", !torchSupported)
      this.torchButton.classList.toggle("btn-active", this.torchEnabled && torchSupported)
    }

    if (this.zoomControl && this.zoomInput) {
      if (capabilities.zoom) {
        const {min, max, step} = capabilities.zoom
        this.zoomInput.min = min
        this.zoomInput.max = max
        this.zoomInput.step = step || 0.1
        this.zoomInput.value = min
        if (this.zoomValue) this.zoomValue.textContent = min
        this.zoomControl.classList.remove("hidden")
      } else {
        this.zoomControl.classList.add("hidden")
      }
    }
  },

  updateSwitchControl() {
    if (!this.switchButton) return
    this.switchButton.disabled = this.devices.length < 2
    this.switchButton.classList.toggle("btn-disabled", this.devices.length < 2)
  },

  currentVideoTrack() {
    return this.stream?.getVideoTracks()[0]
  },

  disableControls() {
    ;[this.startButton, this.stopButton, this.captureButton, this.switchButton, this.torchButton, this.zoomInput]
      .filter(Boolean)
      .forEach(control => {
        control.disabled = true
        control.classList.add("btn-disabled")
      })
  },

  setStatus(message) {
    const span = this.status?.querySelector("span")
    if (span) span.textContent = message
    this.pushEvent("camera_status", {message})
  },

  reportError(message) {
    this.setStatus(message)
    this.pushEvent("camera_error", {message})
  },

  cameraErrorMessage(error) {
    if (error?.name === "NotAllowedError") return "Camera permission was denied."
    if (error?.name === "NotFoundError") return "No camera was found on this device."
    if (error?.name === "NotReadableError") return "Camera is already in use by another app."
    if (error?.name === "OverconstrainedError") return "Requested camera is not available."
    return "Camera could not be started."
  }
}

export default ScannerCamera
