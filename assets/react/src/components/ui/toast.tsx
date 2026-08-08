import * as ToastPrimitive from "@radix-ui/react-toast"
import { CircleAlert, Check, Info, X } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { cn } from "../../lib/utils"
import { Button } from "./button"

type ToastTone = "success" | "info" | "error"

type ToastNotice = {
  id: number
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  showToast: (message: string, options?: { tone?: ToastTone }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const TOAST_DISMISS_MS = 3_500
const TOAST_EVENT = "manavault:toast"

type ToastEventDetail = {
  message: string
  tone?: ToastTone
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotice[]>([])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message: string, options: { tone?: ToastTone } = {}) => {
    const id = Date.now() + Math.floor(Math.random() * 1_000)
    setToasts((current) => [...current, { id, message, tone: options.tone ?? "success" }])
  }, [])

  useEffect(() => {
    function handleToastEvent(event: Event) {
      const detail = (event as CustomEvent<ToastEventDetail>).detail
      if (!detail?.message) return

      showToast(detail.message, { tone: detail.tone })
    }

    window.addEventListener(TOAST_EVENT, handleToastEvent)
    return () => window.removeEventListener(TOAST_EVENT, handleToastEvent)
  }, [showToast])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider duration={TOAST_DISMISS_MS} swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
        <ToastPrimitive.Viewport className="toast toast-bottom toast-end pointer-events-none z-[90] w-auto max-w-[calc(100vw-2rem)] p-4 outline-none sm:toast-top sm:max-w-sm" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context) return context

  return {
    showToast(message: string, options: { tone?: ToastTone } = {}) {
      if (typeof window === "undefined") return

      window.dispatchEvent(
        new CustomEvent<ToastEventDetail>(TOAST_EVENT, {
          detail: { message, tone: options.tone },
        }),
      )
    },
  } satisfies ToastContextValue
}

export function Toast({
  message,
  onDismiss,
  tone = "success",
}: {
  message: string
  onDismiss?: () => void
  tone?: ToastTone
}) {
  const ToastIcon = tone === "success" ? Check : tone === "error" ? CircleAlert : Info

  return (
    <ToastPrimitive.Root
      className={cn(
        "alert pointer-events-auto flex items-start justify-between gap-3 border shadow-lg transition-[transform,opacity]",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-full data-[state=closed]:opacity-0",
        tone === "success"
          ? "alert-success border-success/40 text-success-content"
          : tone === "error"
            ? "alert-error border-error/40 text-error-content"
            : "alert-info border-info/40 text-info-content",
      )}
      onOpenChange={(open) => {
        if (!open) onDismiss?.()
      }}
    >
      <div className="flex items-start gap-2">
        <ToastIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <ToastPrimitive.Description>{message}</ToastPrimitive.Description>
      </div>
      {onDismiss ? (
        <ToastPrimitive.Close asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="btn-xs -mr-2 -mt-1 text-current"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </ToastPrimitive.Close>
      ) : null}
    </ToastPrimitive.Root>
  )
}
