import type { ReactNode } from "react"
import { cn } from "../lib/utils"
import { Card } from "./ui/card"

export function ImageSummaryCard({
  actionSlot,
  countLine,
  detailLine,
  fallback,
  interactive = true,
  imageUrl,
  nameLine,
  priceLine,
  typeLine,
}: {
  actionSlot?: ReactNode
  countLine?: ReactNode
  detailLine?: ReactNode
  fallback?: ReactNode
  interactive?: boolean
  imageUrl?: string | null
  nameLine: ReactNode
  priceLine?: ReactNode
  typeLine?: ReactNode
}) {
  return (
    <Card
      className={cn(
        "group relative min-h-52 overflow-hidden transition-all",
        interactive && "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-base-100 hover:shadow-xl"
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover opacity-35 transition duration-300",
            interactive && "group-hover:scale-105 group-hover:opacity-45"
          )}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-base-200 text-base-content/30">{fallback}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-base-100/95 via-base-100/75 to-base-100/35" />
      <div className="relative z-10 flex min-h-52 flex-col justify-between gap-8 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {typeLine}
            {countLine ? <span className="text-sm font-bold text-base-content/70">{countLine}</span> : null}
            {priceLine ? <span className="text-sm font-bold text-base-content/70">{priceLine}</span> : null}
          </div>
          {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-3xl font-black tracking-normal">{nameLine}</h3>
          {detailLine ? <div className="mt-3 text-sm text-base-content/65">{detailLine}</div> : null}
        </div>
      </div>
    </Card>
  )
}
