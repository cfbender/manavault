import type { ReactNode } from "react"
import { cn } from "../lib/utils"

type CardImagePrinting = {
  imageUrl?: string | null
  image_url?: string | null
  card?: { name?: string | null } | null
} | null

export function CardImage({
  printing,
  className,
}: {
  printing?: CardImagePrinting
  className?: string
}) {
  const name = printing?.card?.name || "Card"
  const imageUrl = printing?.imageUrl || printing?.image_url

  if (!imageUrl) {
    return (
      <div
        className={cn(
          "flex aspect-[5/7] items-center justify-center rounded-lg border border-base-300 bg-base-200 p-4 text-center text-sm text-base-content/60",
          className,
        )}
      >
        {name}
      </div>
    )
  }

  return (
    <img
      className={cn("aspect-[5/7] rounded-lg object-cover shadow-sm", className)}
      src={imageUrl}
      alt={name}
      loading="lazy"
      decoding="async"
    />
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-base-300 bg-base-100 p-8 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-base-content/70">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
