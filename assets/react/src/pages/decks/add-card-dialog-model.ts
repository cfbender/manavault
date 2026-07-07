export function selectedDeckCardNameForMutation(
  typedName: string,
  selectedCard?: { name?: string | null } | null,
) {
  const selectedName = selectedCard?.name?.trim()
  return selectedName || typedName.trim()
}
