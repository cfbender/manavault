import { XCircle } from "lucide-react"
import {
  formatCardCount,
  groupManaContributors,
  manaContributorQuantity,
  type ManaBalanceDetail,
} from "./mana-balance-model"

export function ManaContributorPanel({
  detail,
  onClose,
}: {
  detail: ManaBalanceDetail
  onClose: () => void
}) {
  const groups = groupManaContributors(detail.contributors)
  const listedCardCount = manaContributorQuantity(detail.contributors)

  return (
    <aside
      className="rounded-box border border-primary/20 bg-base-100 p-3 shadow-sm transition-all xl:sticky xl:top-4 xl:self-start"
      aria-label={detail.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black text-base-content">{detail.title}</h4>
          <p className="mt-1 text-xs font-semibold text-base-content/60">
            {detail.summary}
            {listedCardCount > 0 ? ` • ${formatCardCount(listedCardCount)} listed` : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-base-content/50 transition hover:bg-base-200 hover:text-base-content focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Close mana contributor panel"
          onClick={onClose}
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {groups.length > 0 ? (
          groups.map((group) => (
            <section key={group.category} className="grid gap-1.5">
              <h5 className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-base-content/45">
                {group.category}
              </h5>
              <ul className="grid gap-1">
                {group.contributors.map((contributor) => (
                  <li
                    key={`${contributor.id}:${contributor.category}`}
                    className="flex items-center justify-between gap-3 rounded-box bg-base-200/70 px-2.5 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-semibold text-base-content">
                      <span className="font-mono font-black">{contributor.quantity}</span>{" "}
                      {contributor.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-base-100 px-2 py-0.5 font-mono text-xs font-black text-base-content/65">
                      {contributor.value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="rounded-box border border-dashed border-base-300 bg-base-200/60 px-3 py-4 text-sm font-semibold text-base-content/55">
            {detail.emptyText}
          </p>
        )}
      </div>
    </aside>
  )
}
