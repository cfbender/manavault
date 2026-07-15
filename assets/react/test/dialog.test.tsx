import { useState } from "react"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"

import { closeTopNativeBackModal } from "../src/lib/native-modal-stack"
import { ConfirmDialog } from "../src/components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../src/components/ui/dialog"

type DialogHarnessProps = {
  onClose: () => void
}

function DialogHarness({ onClose }: DialogHarnessProps) {
  const [open, setOpen] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) onClose()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open inventory dialog
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg" describedBy="inventory-dialog-description">
          <DialogHeader>
            <div>
              <DialogTitle>Inventory dialog</DialogTitle>
              <p id="inventory-dialog-description">Choose an inventory action.</p>
            </div>
            <DialogClose onClose={() => handleOpenChange(false)} />
          </DialogHeader>
          <div>
            <button type="button">Middle action</button>
            <button type="button" onClick={() => handleOpenChange(false)}>
              Last action
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

type ConfirmDialogHarnessProps = {
  onClose: () => void
  onConfirm: () => void
}

function ConfirmDialogHarness({ onClose, onConfirm }: ConfirmDialogHarnessProps) {
  const [open, setOpen] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) onClose()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Start deletion
      </button>
      <ConfirmDialog
        cancelLabel="Keep cards"
        confirmLabel="Delete cards"
        destructive
        onConfirm={onConfirm}
        onOpenChange={handleOpenChange}
        open={open}
        title="Delete selected cards?"
      >
        This cannot be undone.
      </ConfirmDialog>
    </>
  )
}

type NestedDialogHarnessProps = {
  onNestedClose: () => void
  onParentClose: () => void
}

function NestedDialogHarness({ onNestedClose, onParentClose }: NestedDialogHarnessProps) {
  const [nestedOpen, setNestedOpen] = useState(false)
  const [parentOpen, setParentOpen] = useState(false)

  function handleParentOpenChange(nextOpen: boolean) {
    setParentOpen(nextOpen)
    if (!nextOpen) onParentClose()
  }

  function handleNestedOpenChange(nextOpen: boolean) {
    setNestedOpen(nextOpen)
    if (!nextOpen) onNestedClose()
  }

  return (
    <>
      <button type="button" onClick={() => setParentOpen(true)}>
        Open parent dialog
      </button>
      <Dialog open={parentOpen} onOpenChange={handleParentOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parent dialog</DialogTitle>
            <DialogClose onClose={() => handleParentOpenChange(false)} />
          </DialogHeader>
          <button type="button" onClick={() => setNestedOpen(true)}>
            Open nested dialog
          </button>
          <Dialog open={nestedOpen} onOpenChange={handleNestedOpenChange}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nested dialog</DialogTitle>
                <DialogClose onClose={() => handleNestedOpenChange(false)} />
              </DialogHeader>
              <button type="button">Nested action</button>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Dialog", () => {
  test("names and describes the modal, makes the background inert, traps focus, and restores focus", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)

    const trigger = screen.getByRole("button", { name: "Open inventory dialog" })
    const appRoot = trigger.parentElement
    if (!appRoot) throw new Error("Expected the dialog trigger to have an application root")

    await user.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "Inventory dialog" })
    const controls = within(dialog)
    const closeButton = controls.getByRole("button", { name: "Close dialog" })
    const middleButton = controls.getByRole("button", { name: "Middle action" })
    const lastButton = controls.getByRole("button", { name: "Last action" })

    expect(dialog.getAttribute("aria-describedby")).toBe("inventory-dialog-description")
    expect(screen.getByText("Choose an inventory action.").id).toBe("inventory-dialog-description")
    expect(appRoot.getAttribute("aria-hidden")).toBe("true")
    await waitFor(() => expect(document.activeElement).toBe(closeButton))

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(lastButton)
    await user.tab()
    expect(document.activeElement).toBe(closeButton)
    await user.tab()
    expect(document.activeElement).toBe(middleButton)
    await user.tab()
    expect(document.activeElement).toBe(lastButton)
    await user.tab()
    expect(document.activeElement).toBe(closeButton)

    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog", { name: "Inventory dialog" })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  test("Escape dismisses once and restores focus", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)

    const trigger = screen.getByRole("button", { name: "Open inventory dialog" })
    await user.click(trigger)
    await user.keyboard("{Escape}")

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog", { name: "Inventory dialog" })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  test("clicking the backdrop dismisses once", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)

    await user.click(screen.getByRole("button", { name: "Open inventory dialog" }))
    const dialog = screen.getByRole("dialog", { name: "Inventory dialog" })
    const overlay = dialog.parentElement?.previousElementSibling
    if (!(overlay instanceof HTMLElement)) throw new Error("Expected a dialog backdrop")

    await user.click(overlay)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog", { name: "Inventory dialog" })).toBeNull()
  })

  test("native back dismisses once even when repeated before the controlled state updates", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)

    await user.click(screen.getByRole("button", { name: "Open inventory dialog" }))

    act(() => {
      expect(closeTopNativeBackModal()).toBe(true)
      expect(closeTopNativeBackModal()).toBe(true)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog", { name: "Inventory dialog" })).toBeNull()
    expect(closeTopNativeBackModal()).toBe(false)
  })

  test("keeps stacked dialogs scroll-locked and native back closes only the top dialog", async () => {
    const user = userEvent.setup()
    const onNestedClose = vi.fn()
    const onParentClose = vi.fn()
    render(<NestedDialogHarness onNestedClose={onNestedClose} onParentClose={onParentClose} />)

    const parentTrigger = screen.getByRole("button", { name: "Open parent dialog" })
    await user.click(parentTrigger)
    const nestedTrigger = screen.getByRole("button", { name: "Open nested dialog" })
    await user.click(nestedTrigger)

    expect(screen.getByRole("dialog", { name: "Nested dialog" })).toBeInstanceOf(HTMLElement)
    await waitFor(() => expect(document.body.hasAttribute("data-scroll-locked")).toBe(true))

    act(() => {
      expect(closeTopNativeBackModal()).toBe(true)
    })

    expect(onNestedClose).toHaveBeenCalledTimes(1)
    expect(onParentClose).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog", { name: "Nested dialog" })).toBeNull()
    expect(screen.getByRole("dialog", { name: "Parent dialog" })).toBeInstanceOf(HTMLElement)
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(nestedTrigger))

    await user.keyboard("{Escape}")

    expect(onParentClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(document.body.hasAttribute("data-scroll-locked")).toBe(false))
    await waitFor(() => expect(document.activeElement).toBe(parentTrigger))
  })
})

describe("ConfirmDialog", () => {
  test("keeps destructive semantics and emits one action for cancellation and confirmation", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialogHarness onClose={onClose} onConfirm={onConfirm} />)

    const trigger = screen.getByRole("button", { name: "Start deletion" })
    await user.click(trigger)

    const alertDialog = screen.getByRole("alertdialog", { name: "Delete selected cards?" })
    const descriptionId = alertDialog.getAttribute("aria-describedby")
    if (!descriptionId) throw new Error("Expected destructive confirmation copy to describe the dialog")

    const cancelButton = within(alertDialog).getByRole("button", { name: "Keep cards" })
    const confirmButton = within(alertDialog).getByRole("button", { name: "Delete cards" })

    expect(document.getElementById(descriptionId)?.textContent).toBe("This cannot be undone.")
    expect(confirmButton.classList.contains("btn-error")).toBe(true)

    await user.click(cancelButton)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(trigger)
    await user.click(screen.getByRole("button", { name: "Delete cards" }))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alertdialog", { name: "Delete selected cards?" })).toBeNull()
  })
})
