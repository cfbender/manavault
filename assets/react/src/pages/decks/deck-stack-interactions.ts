export function shouldRevealDeckStackCardOnPointerDown({
  isActive,
  pointerType,
}: {
  isActive: boolean
  pointerType: string
}) {
  return pointerType !== "mouse" && !isActive
}
