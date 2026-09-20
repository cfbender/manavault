import { usePrism, type PrismOptions } from "./use-prism"
import "./Prism.css"

export type PrismProps = PrismOptions

export default function Prism(props: PrismProps) {
  const containerRef = usePrism(props)
  return <div className="prism-container" ref={containerRef} />
}
