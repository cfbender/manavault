import { Link } from "@tanstack/react-router"
import { Sparkles } from "lucide-react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"

type AutoSortRuleVisibility = {
  enabled?: boolean | null
}

export function hasEnabledAutoSortRules(rules: readonly AutoSortRuleVisibility[]) {
  return rules.some((rule) => rule.enabled === true)
}

export function AutoSortSetupDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" labelledBy="auto-sort-setup-title">
        <DialogHeader>
          <div>
            <DialogTitle id="auto-sort-setup-title">Set up collection auto-sort</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Add at least one enabled rule in Settings before auto-sort can file cards.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <p className="text-sm text-base-content/70">
            Auto-sort checks enabled rules by priority and moves each matching card to the first
            matching box or binder destination. Cards that do not match stay where they are; unfiled
            cards remain Unfiled unless a rule matches them.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
            <Button asChild onClick={() => onOpenChange(false)}>
              <Link to="/settings">
                <Sparkles className="h-4 w-4" />
                Configure rules in Settings
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
