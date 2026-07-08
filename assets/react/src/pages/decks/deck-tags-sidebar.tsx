import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { useState, type FormEvent } from "react"

import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import { DECK_TAG_COLORS } from "./deck-types"
import type { DeckCustomTag } from "./deck-types"

type DeckTagInput = { name: string; color: string; targetCount: number | null }

type EditingState = { kind: "closed" } | { kind: "create" } | { kind: "edit"; tagId: string }

export function DeckTagsSidebar({
  tags,
  activeTagId,
  onJumpToTag,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onReorderTags,
  disabled = false,
}: {
  tags: DeckCustomTag[]
  activeTagId: string | null
  onJumpToTag: (tagId: string) => void
  onCreateTag: (input: DeckTagInput) => void
  onUpdateTag: (id: string, input: DeckTagInput) => void
  onDeleteTag: (id: string) => void
  onReorderTags: (tagIds: string[]) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState<EditingState>({ kind: "closed" })
  const sortedTags = [...tags].sort((a, b) => a.position - b.position)

  function handleMove(tagId: string, direction: "up" | "down") {
    const currentIndex = sortedTags.findIndex((tag) => tag.id === tagId)
    if (currentIndex === -1) return

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= sortedTags.length) return

    const reordered = [...sortedTags]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    onReorderTags(reordered.map((tag) => tag.id))
  }

  function handleCreate(input: DeckTagInput) {
    onCreateTag(input)
    setEditing({ kind: "closed" })
  }

  function handleUpdate(tagId: string, input: DeckTagInput) {
    onUpdateTag(tagId, input)
    setEditing({ kind: "closed" })
  }

  return (
    <aside
      className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-3"
      aria-labelledby="deck-tags-heading"
    >
      <div className="flex items-center gap-2 px-1">
        <Tag className="h-4 w-4 shrink-0 text-base-content/60" aria-hidden="true" />
        <h2
          id="deck-tags-heading"
          className="text-sm font-bold uppercase tracking-wide text-base-content/70"
        >
          DECK TAGS
        </h2>
      </div>

      {sortedTags.length === 0 ? (
        <p className="px-1 text-xs font-semibold text-base-content/55">
          No custom tags yet. Add one to group and track cards toward a target.
        </p>
      ) : null}

      <ul className="grid gap-1">
        {sortedTags.map((tag, index) =>
          editing.kind === "edit" && editing.tagId === tag.id ? (
            <li key={tag.id}>
              <DeckTagEditor
                mode="edit"
                initialName={tag.name}
                initialColor={tag.color}
                initialTargetCount={tag.targetCount ?? null}
                onSave={(input) => handleUpdate(tag.id, input)}
                onCancel={() => setEditing({ kind: "closed" })}
              />
            </li>
          ) : (
            <li key={tag.id}>
              <DeckTagRow
                tag={tag}
                isActive={activeTagId === tag.id}
                disabled={disabled}
                isFirst={index === 0}
                isLast={index === sortedTags.length - 1}
                onJump={() => onJumpToTag(tag.id)}
                onEdit={() => setEditing({ kind: "edit", tagId: tag.id })}
                onDelete={() => onDeleteTag(tag.id)}
                onMoveUp={() => handleMove(tag.id, "up")}
                onMoveDown={() => handleMove(tag.id, "down")}
              />
            </li>
          ),
        )}
      </ul>

      {editing.kind === "create" ? (
        <DeckTagEditor
          mode="create"
          initialName=""
          initialColor={DECK_TAG_COLORS[0]}
          initialTargetCount={null}
          onSave={handleCreate}
          onCancel={() => setEditing({ kind: "closed" })}
        />
      ) : null}

      {!disabled && editing.kind !== "create" ? (
        <button
          type="button"
          className="btn btn-outline btn-sm justify-center gap-1.5"
          onClick={() => setEditing({ kind: "create" })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          ADD TAG
        </button>
      ) : null}
    </aside>
  )
}

function DeckTagRow({
  tag,
  isActive,
  disabled,
  isFirst,
  isLast,
  onJump,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  tag: DeckCustomTag
  isActive: boolean
  disabled: boolean
  isFirst: boolean
  isLast: boolean
  onJump: () => void
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const targetCount = tag.targetCount ?? null
  const progressPercent =
    targetCount && targetCount > 0 ? Math.min(tag.cardCount / targetCount, 1) * 100 : null

  return (
    <div
      className={cn(
        "group rounded-box border border-transparent px-2.5 py-2 transition-colors",
        isActive ? "border-primary/40 bg-primary/10" : "hover:bg-base-200/70",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: tag.color }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">
          {tag.name}
        </span>
        <span className="shrink-0 font-mono text-xs font-bold text-base-content/60">
          {tag.cardCount}/{targetCount ?? "\u2014"}
        </span>
        <button
          type="button"
          aria-label={`Jump to ${tag.name} cards`}
          aria-pressed={isActive}
          className={cn("btn btn-ghost btn-xs btn-square shrink-0", isActive && "text-primary")}
          onClick={onJump}
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-base-300/70">
        {progressPercent !== null ? (
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${progressPercent}%`, backgroundColor: tag.color }}
          />
        ) : null}
      </div>

      {disabled ? null : confirmingDelete ? (
        <div className="mt-1.5 flex items-center justify-end gap-1.5">
          <span className="mr-auto text-xs font-semibold text-base-content/70">Delete tag?</span>
          <button
            type="button"
            aria-label={`Confirm delete ${tag.name}`}
            className="btn btn-error btn-xs btn-square"
            onClick={onDelete}
          >
            <Check className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Cancel delete ${tag.name}`}
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => setConfirmingDelete(false)}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={`Move ${tag.name} up`}
            className="btn btn-ghost btn-xs btn-square"
            disabled={isFirst}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Move ${tag.name} down`}
            className="btn btn-ghost btn-xs btn-square"
            disabled={isLast}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Edit ${tag.name}`}
            className="btn btn-ghost btn-xs btn-square"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${tag.name}`}
            className="btn btn-ghost btn-xs btn-square text-error"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

function DeckTagEditor({
  mode,
  initialName,
  initialColor,
  initialTargetCount,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit"
  initialName: string
  initialColor: string
  initialTargetCount: number | null
  onSave: (input: DeckTagInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [targetCountInput, setTargetCountInput] = useState(
    initialTargetCount != null ? String(initialTargetCount) : "",
  )

  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return

    const parsedTarget = targetCountInput.trim() === "" ? null : Number(targetCountInput)
    const targetCount =
      parsedTarget !== null && Number.isFinite(parsedTarget) && parsedTarget > 0
        ? Math.trunc(parsedTarget)
        : null

    onSave({ name: trimmedName, color, targetCount })
  }

  return (
    <form
      className="grid gap-2 rounded-box border border-primary/30 bg-base-200/70 p-2.5"
      aria-label={mode === "create" ? "Add tag" : `Edit ${initialName || "tag"}`}
      onSubmit={handleSubmit}
    >
      <label className="grid gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-base-content/60">Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tag name"
          autoFocus
        />
      </label>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tag color">
        {DECK_TAG_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Use color ${swatch}`}
            aria-pressed={color === swatch}
            className={cn(
              "h-6 w-6 rounded-full border-2 transition-transform",
              color === swatch
                ? "scale-110 border-base-content"
                : "border-transparent opacity-80 hover:opacity-100",
            )}
            style={{ backgroundColor: swatch }}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-base-content/60">
          Target count
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={targetCountInput}
          onChange={(event) => setTargetCountInput(event.target.value)}
          placeholder="No target"
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!canSave}>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Save
        </button>
      </div>
    </form>
  )
}
