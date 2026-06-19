type ReplyStatus = "ok" | "error" | "timeout"

type Reply<T> = {
  status: ReplyStatus
  response: T
}

type PendingPush<T> = {
  reject: (error: Error) => void
  resolve: (value: T) => void
  timer: number
}

export class PhoenixChannel {
  private readonly socket: PhoenixSocket
  private readonly topic: string
  private joinRef: string | null = null

  constructor(socket: PhoenixSocket, topic: string) {
    this.socket = socket
    this.topic = topic
  }

  join() {
    this.joinRef = this.socket.nextRef()
    return this.socket.push(this.joinRef, this.topic, "phx_join", {})
  }

  push<T>(event: string, payload: unknown, timeoutMs = 30000) {
    return this.socket.push<T>(this.joinRef, this.topic, event, payload, timeoutMs)
  }
}

export class PhoenixSocket {
  private readonly url: string
  private heartbeatTimer: number | null = null
  private ref = 0
  private socket: WebSocket | null = null
  private readonly pending = new Map<string, PendingPush<unknown>>()

  constructor(path: string) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    this.url = `${protocol}//${window.location.host}${path}/websocket?vsn=2.0.0`
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url)
      this.socket = socket

      socket.addEventListener(
        "open",
        () => {
          this.heartbeatTimer = window.setInterval(() => {
            this.push(null, "phoenix", "heartbeat", {}).catch(() => undefined)
          }, 30000)
          resolve()
        },
        { once: true },
      )
      socket.addEventListener("message", (event) => this.handleMessage(event))
      socket.addEventListener(
        "error",
        () => {
          reject(new Error("Scanner websocket failed to connect."))
        },
        { once: true },
      )
      socket.addEventListener("close", () => this.closePending("Scanner websocket closed."))
    })
  }

  channel(topic: string) {
    return new PhoenixChannel(this, topic)
  }

  disconnect() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.socket?.close()
    this.socket = null
    this.closePending("Scanner websocket disconnected.")
  }

  nextRef() {
    this.ref += 1
    return String(this.ref)
  }

  push<T>(
    joinRef: string | null,
    topic: string,
    event: string,
    payload: unknown,
    timeoutMs = 10000,
  ): Promise<T> {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Scanner websocket is not connected."))
    }

    const ref = this.nextRef()
    this.socket.send(JSON.stringify([joinRef, ref, topic, event, payload]))

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(ref)
        reject(new Error("Scanner websocket request timed out."))
      }, timeoutMs)
      this.pending.set(ref, { resolve: resolve as (value: unknown) => void, reject, timer })
    })
  }

  private handleMessage(event: MessageEvent<string>) {
    const message = JSON.parse(event.data) as [string | null, string | null, string, string, unknown]
    const [, ref, , eventName, payload] = message
    if (eventName !== "phx_reply" || !ref) return

    const pending = this.pending.get(ref)
    if (!pending) return

    window.clearTimeout(pending.timer)
    this.pending.delete(ref)

    const reply = payload as Reply<unknown>
    if (reply.status === "ok") {
      pending.resolve(reply.response)
    } else {
      const message =
        typeof reply.response === "object" && reply.response && "message" in reply.response
          ? String(reply.response.message)
          : "Scanner websocket request failed."
      pending.reject(new Error(message))
    }
  }

  private closePending(message: string) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }
}
