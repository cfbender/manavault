const viteOrigin = document.querySelector('meta[name="manavault-vite-origin"]')?.content || ""
const fromVite = (path) => `${viteOrigin}${path}`

const { default: RefreshRuntime } = await import(fromVite("/@react-refresh"))
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true

await import(fromVite("/@vite/client"))
await import(fromVite("/assets/react/src/main.tsx"))
