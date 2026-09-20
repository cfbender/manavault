import { useEffect, useReducer, type Dispatch, type SetStateAction } from "react"

import {
  NO_DECK_DETAIL_OVERLAY,
  type DeckDetailOverlay,
} from "./deck-detail-overlay"

type DialogState = {
  activeTagId: string | null
  context: DialogContext
  overlay: DeckDetailOverlay
}

type DialogContext = {
  canEdit: boolean
  deckId: string
  edhrecOpen: boolean
  shareMode: boolean
}

type DialogAction =
  | { type: "sync"; context: DialogContext }
  | { type: "set-active-tag"; value: SetStateAction<string | null> }
  | { type: "set-overlay"; value: SetStateAction<DeckDetailOverlay> }

function allowedOverlay(overlay: DeckDetailOverlay, context: DialogContext) {
  if (context.shareMode) {
    return overlay.kind === "preview-card" ||
      overlay.kind === "share-buylist" ||
      overlay.kind === "share-playtest"
      ? overlay
      : NO_DECK_DETAIL_OVERLAY
  }
  if (!context.canEdit) {
    return overlay.kind === "edit-deck" ||
      overlay.kind === "export-deck" ||
      overlay.kind === "preview-card" ||
      overlay.kind === "share-deck" ||
      overlay.kind === "shortcuts"
      ? overlay
      : NO_DECK_DETAIL_OVERLAY
  }
  return overlay
}

function reducer(state: DialogState, action: DialogAction): DialogState {
  if (action.type === "set-active-tag") {
    const value = typeof action.value === "function" ? action.value(state.activeTagId) : action.value
    return { ...state, activeTagId: value }
  }
  if (action.type === "set-overlay") {
    const value = typeof action.value === "function" ? action.value(state.overlay) : action.value
    return { ...state, overlay: allowedOverlay(value, state.context) }
  }

  const deckChanged = state.context.deckId !== action.context.deckId
  const routeOpened = !state.context.edhrecOpen && action.context.edhrecOpen
  const routeClosed = state.context.edhrecOpen && !action.context.edhrecOpen
  const requestedOverlay = deckChanged
    ? NO_DECK_DETAIL_OVERLAY
    : routeOpened
      ? { kind: "edhrec" as const }
      : routeClosed && state.overlay.kind === "edhrec"
        ? NO_DECK_DETAIL_OVERLAY
        : state.overlay

  return {
    activeTagId: deckChanged ? null : state.activeTagId,
    context: action.context,
    overlay: allowedOverlay(requestedOverlay, action.context),
  }
}

export function useDeckDialogs(context: DialogContext) {
  const [state, dispatch] = useReducer(reducer, {
    activeTagId: null,
    context,
    overlay: context.edhrecOpen ? { kind: "edhrec" } : NO_DECK_DETAIL_OVERLAY,
  })

  useEffect(() => dispatch({ type: "sync", context }), [
    context.canEdit,
    context.deckId,
    context.edhrecOpen,
    context.shareMode,
  ])

  return {
    activeTagId: state.activeTagId,
    overlay: state.overlay,
    setActiveTagId: ((value) => dispatch({ type: "set-active-tag", value })) as Dispatch<
      SetStateAction<string | null>
    >,
    setOverlay: ((value) => dispatch({ type: "set-overlay", value })) as Dispatch<
      SetStateAction<DeckDetailOverlay>
    >,
  }
}
