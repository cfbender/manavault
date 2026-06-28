type NativeBackModalCloser = () => void

const nativeBackModalClosers: NativeBackModalCloser[] = []

export function registerNativeBackModal(close: NativeBackModalCloser) {
  nativeBackModalClosers.push(close)

  return () => {
    const index = nativeBackModalClosers.lastIndexOf(close)
    if (index >= 0) nativeBackModalClosers.splice(index, 1)
  }
}

export function hasNativeBackModal() {
  return nativeBackModalClosers.length > 0
}

export function closeTopNativeBackModal() {
  const close = nativeBackModalClosers.at(-1)
  if (!close) return false

  close()
  return true
}
