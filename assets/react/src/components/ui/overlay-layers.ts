// Body portals share one stacking scale. Floating controls and card previews
// must clear both the dialog backdrop and its content wrapper.
export const overlayLayers = { dialog: 1100, floating: 1200 } as const
