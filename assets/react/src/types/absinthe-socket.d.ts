declare module "@absinthe/socket" {
  import type { Socket } from "phoenix"

  export type GqlResponse = {
    data?: Record<string, unknown>
    errors?: Array<{ message: string }>
  }

  export type Observer = {
    onAbort?: (error: Error) => void
    onError?: (error: Error) => void
    onResult?: (result: GqlResponse) => void
  }

  export type Notifier = object
  export type AbsintheSocket = object

  export function create(socket: Socket): AbsintheSocket
  export function send(
    socket: AbsintheSocket,
    request: { operation: string; variables?: Record<string, unknown> },
  ): Notifier
  export function observe(socket: AbsintheSocket, notifier: Notifier, observer: Observer): Notifier
  export function unobserveOrCancel(
    socket: AbsintheSocket,
    notifier: Notifier,
    observer: Observer,
  ): AbsintheSocket
}
