export function BuylistOptionCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="label inline-flex h-8 cursor-pointer justify-start gap-2 rounded-full border border-base-300 bg-base-100/60 px-3 py-1">
      <input
        type="checkbox"
        className="checkbox checkbox-xs"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="label-text text-xs">{label}</span>
    </label>
  )
}
