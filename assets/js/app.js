// If you want to use Phoenix channels, run `mix help phx.gen.channel`
// to get started and then uncomment the line below.
// import "./user_socket.js"

// You can include dependencies in two ways.
//
// The simplest option is to put them in assets/vendor and
// import them using relative paths:
//
//     import "../vendor/some-package.js"
//
// Alternatively, you can `npm install some-package --prefix assets` and import
// them using a path starting with the package name:
//
//     import "some-package"
//
// If you have dependencies that try to import CSS, esbuild will generate a separate `app.css` file.
// To load it, simply add a second `<link>` to your `root.html.heex` file.

// Include phoenix_html to handle method=PUT/DELETE in forms and buttons.
import "phoenix_html"
// Establish Phoenix Socket and LiveView configuration.
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import {hooks as colocatedHooks} from "phoenix-colocated/manavault"
import ScannerCamera from "./scanner_camera"
import topbar from "../vendor/topbar"

const DeckPreview = {
  mounted() {
    this.el.addEventListener("manavault:close-card-menu", event => {
      event.target.classList.add("card-menu-closed")
      event.target.addEventListener("mouseleave", () => {
        event.target.classList.remove("card-menu-closed")
      }, {once: true})

      window.setTimeout(() => {
        const activeElement = document.activeElement

        if (activeElement && event.target.contains(activeElement)) {
          activeElement.blur()
        }
      }, 0)
    })

    this.el.addEventListener("click", event => {
      const actionsButton = event.target.closest("[data-card-actions-button]")
      if (!actionsButton || !this.el.contains(actionsButton)) return

      actionsButton.closest("[data-preview-card]")?.classList.remove("card-menu-closed")
    })

    this.el.addEventListener("mouseover", event => {
      const card = event.target.closest("[data-preview-card]")
      if (!card || !this.el.contains(card)) return

      const image = document.getElementById("deck-preview-image")
      const fallback = document.getElementById("deck-preview-fallback")
      const name = document.getElementById("deck-preview-name")
      const type = document.getElementById("deck-preview-type")
      const set = document.getElementById("deck-preview-set")
      const finish = document.getElementById("deck-preview-finish")
      const quantity = document.getElementById("deck-preview-quantity")
      const imageUrl = card.dataset.previewImage

      if (image && fallback) {
        if (imageUrl) {
          image.src = imageUrl
          image.alt = card.dataset.previewName || ""
          image.hidden = false
          fallback.hidden = true
        } else {
          image.hidden = true
          fallback.hidden = false
        }
      }

      if (name) name.textContent = card.dataset.previewName || "No card selected"
      if (type) type.textContent = card.dataset.previewType || ""
      if (set) set.textContent = card.dataset.previewSet || "Unknown printing"
      if (finish) finish.textContent = card.dataset.previewFinish || "Nonfoil"

      if (quantity) {
        const value = Number(card.dataset.previewQuantity || "1")
        quantity.textContent = `×${value}`
        quantity.hidden = value <= 1
      }
    })
  }
}

const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
const liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: {_csrf_token: csrfToken},
  hooks: {...colocatedHooks, ScannerCamera, DeckPreview},
})

// Show progress bar on live navigation and form submits
topbar.config({barColors: {0: "#29d"}, shadowColor: "rgba(0, 0, 0, .3)"})
window.addEventListener("phx:page-loading-start", _info => topbar.show(300))
window.addEventListener("phx:page-loading-stop", _info => topbar.hide())

window.addEventListener("manavault:flash-mounted", event => {
  const flash = event.target

  window.setTimeout(() => {
    if (flash.isConnected) flash.click()
  }, 2000)
})

// connect if there are any LiveViews on the page
liveSocket.connect()

// expose liveSocket on window for web console debug logs and latency simulation:
// >> liveSocket.enableDebug()
// >> liveSocket.enableLatencySim(1000)  // enabled for duration of browser session
// >> liveSocket.disableLatencySim()
window.liveSocket = liveSocket

// The lines below enable quality of life phoenix_live_reload
// development features:
//
//     1. stream server logs to the browser console
//     2. click on elements to jump to their definitions in your code editor
//
if (process.env.NODE_ENV === "development") {
  window.addEventListener("phx:live_reload:attached", ({detail: reloader}) => {
    // Enable server log streaming to client.
    // Disable with reloader.disableServerLogs()
    reloader.enableServerLogs()

    // Open configured PLUG_EDITOR at file:line of the clicked element's HEEx component
    //
    //   * click with "c" key pressed to open at caller location
    //   * click with "d" key pressed to open at function component definition location
    let keyDown
    window.addEventListener("keydown", e => keyDown = e.key)
    window.addEventListener("keyup", _e => keyDown = null)
    window.addEventListener("click", e => {
      if(keyDown === "c"){
        e.preventDefault()
        e.stopImmediatePropagation()
        reloader.openEditorAtCaller(e.target)
      } else if(keyDown === "d"){
        e.preventDefault()
        e.stopImmediatePropagation()
        reloader.openEditorAtDef(e.target)
      }
    }, true)

    window.liveReloader = reloader
  })
}
