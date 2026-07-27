export function currentCsrfToken() {
  return document.querySelector("meta[name='csrf-token']")?.getAttribute("content") ?? undefined
}
