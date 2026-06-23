import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import {
  checkNativeShellUpdate,
  clearNativeServerUrl,
  getNativeShellSettings,
  isNativeShell,
  saveNativeServerUrl,
  type NativeShellSettings,
  type NativeShellUpdateCheck,
} from "../../lib/native-shell"
import { errorMessage } from "./data"
import type { NativeAppSectionProps } from "./native-app-section"

export function useNativeShellSection(): {
  nativeShell: boolean
  nativeSectionProps: NativeAppSectionProps
} {
  const nativeShell = isNativeShell()
  const [nativeServerUrl, setNativeServerUrl] = useState("")
  const [nativeSettings, setNativeSettings] = useState<NativeShellSettings | null>(null)
  const [nativeUpdate, setNativeUpdate] = useState<NativeShellUpdateCheck | null>(null)
  const [nativeLoading, setNativeLoading] = useState(nativeShell)
  const [nativeUpdateLoading, setNativeUpdateLoading] = useState(false)
  const [nativeMessage, setNativeMessage] = useState<string | null>(null)
  const [nativeError, setNativeError] = useState<string | null>(null)

  useEffect(() => {
    if (!nativeShell) return

    let ignore = false

    setNativeLoading(true)
    void getNativeShellSettings()
      .then((settings) => {
        if (ignore) return

        setNativeSettings(settings)
        setNativeServerUrl(settings?.serverUrl ?? window.location.origin)
      })
      .catch((err: unknown) => {
        if (!ignore) setNativeError(errorMessage(err))
      })
      .finally(() => {
        if (!ignore) setNativeLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [nativeShell])

  async function submitNativeServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNativeMessage(null)
    setNativeError(null)

    try {
      const serverUrl = await saveNativeServerUrl(nativeServerUrl)
      setNativeServerUrl(serverUrl)
      setNativeSettings((current) => ({ ...current, serverUrl }))
      setNativeMessage("Server saved. Opening ManaVault...")
      window.location.href = serverUrl
    } catch (err) {
      setNativeError(errorMessage(err))
    }
  }

  async function clearNativeServer() {
    setNativeMessage(null)
    setNativeError(null)

    try {
      await clearNativeServerUrl()
      setNativeSettings((current) => ({ ...current, serverUrl: null }))
      setNativeMessage("Server cleared. The setup screen will appear on next launch.")
    } catch (err) {
      setNativeError(errorMessage(err))
    }
  }

  async function checkForNativeUpdates() {
    setNativeMessage(null)
    setNativeError(null)
    setNativeUpdateLoading(true)

    try {
      const result = await checkNativeShellUpdate(nativeSettings)
      setNativeUpdate(result)
      setNativeMessage(
        result.updateAvailable
          ? `Mobile app ${result.latestVersion} is available.`
          : `Mobile app ${result.appVersion} is current.`,
      )
    } catch (err) {
      setNativeError(errorMessage(err))
    } finally {
      setNativeUpdateLoading(false)
    }
  }

  return {
    nativeShell,
    nativeSectionProps: {
      serverUrl: nativeServerUrl,
      setServerUrl: setNativeServerUrl,
      settings: nativeSettings,
      update: nativeUpdate,
      loading: nativeLoading,
      updateLoading: nativeUpdateLoading,
      message: nativeMessage,
      error: nativeError,
      onSubmit: submitNativeServer,
      onClear: clearNativeServer,
      onCheckUpdates: checkForNativeUpdates,
    },
  }
}
