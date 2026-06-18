import { X } from "lucide-react"
import type { InputHTMLAttributes } from "react"
import { cn } from "../lib/utils"
import { Input } from "./ui/input"

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  onClear?: () => void
  onValueChange: (value: string) => void
  value: string
}

export function SearchField({ className, onClear, onValueChange, value, ...props }: SearchFieldProps) {
  return (
    <div className="relative">
      <Input
        {...props}
        type="search"
        value={value}
        onChange={event => onValueChange(event.target.value)}
        className={cn("pr-10 [&::-webkit-search-cancel-button]:appearance-none", className)}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onClear || (() => onValueChange(""))}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
