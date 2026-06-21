import type { ComponentType } from "react"

type PrismProps = {
  height?: number
  baseWidth?: number
  animationType?: "rotate" | "hover" | "3drotate"
  glow?: number
  offset?: { x?: number; y?: number }
  noise?: number
  transparent?: boolean
  scale?: number
  hueShift?: number
  colorFrequency?: number
  hoverStrength?: number
  inertia?: number
  bloom?: number
  suspendWhenOffscreen?: boolean
  timeScale?: number
}

declare const Prism: ComponentType<PrismProps>
export default Prism
