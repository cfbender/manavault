import {
  Bomb,
  BookOpen,
  Box,
  Brain,
  Circle,
  Cog,
  Copy as CopyIcon,
  Crown,
  Database,
  Droplets,
  Flame,
  Gem,
  Hammer,
  Hand,
  HeartPulse,
  Layers,
  Lock,
  Palette,
  PawPrint,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  Star,
  Swords,
  Target,
  Trash2,
  TrendingUp,
  WandSparkles,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { ManaSymbol } from "../../components/ui/mana-symbols"
import { type DeckGroupIcon } from "../../lib/deck-grouping"
import { cn } from "../../lib/utils"
import type { DeckZone } from "./deck-types"

export const GROUP_ICON_COMPONENTS = {
  aristocrats: Skull,
  artifact: Gem,
  auras: Sparkles,
  blink: Repeat2,
  burn: Flame,
  card_advantage: BookOpen,
  combo: Brain,
  commander: Crown,
  copy: CopyIcon,
  counters: Plus,
  creature: PawPrint,
  discard: Trash2,
  drain: Droplets,
  enchantment: Sparkles,
  engine: Cog,
  equipment: Swords,
  evasion: Wind,
  graveyard_hate: Skull,
  instant: Zap,
  land: Droplets,
  lifegain: HeartPulse,
  mass_disruption: Bomb,
  mill: Database,
  none: Layers,
  planeswalker: Palette,
  protection: Shield,
  pump: TrendingUp,
  ramp: TrendingUp,
  recursion: RotateCcw,
  sacrifice: Skull,
  sorcery: WandSparkles,
  spellslinger: Zap,
  stax: Lock,
  storm: Zap,
  sunforger: Hammer,
  targeted_disruption: Target,
  theft: Hand,
  tokens: Circle,
  tutor: Search,
  voltron: ShieldCheck,
  win_condition: Star,
} satisfies Partial<Record<Extract<DeckGroupIcon, string>, LucideIcon>>

export function GroupIcon({ icon }: { icon: DeckGroupIcon }) {
  const className = "h-4 w-4 shrink-0 text-warning"

  if (typeof icon === "object") {
    if (icon.kind === "colors") {
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5">
          {icon.colors.map((color) => (
            <ManaSymbol key={color} symbol={color} className="h-4 w-4" />
          ))}
        </span>
      )
    }

    if (icon.kind === "manaValue") {
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5">
          <ManaSymbol symbol={String(icon.value)} className="h-4 w-4" />
          {icon.plus ? <span className="text-xs font-black text-warning">+</span> : null}
        </span>
      )
    }

    if (icon.kind === "rarity") {
      return <Star className="h-4 w-4 shrink-0" style={{ color: rarityColor(icon.rarity) }} />
    }

    return <SetSymbol setCode={icon.setCode} />
  }

  const Icon = GROUP_ICON_COMPONENTS[icon]
  if (Icon) return <Icon className={className} />

  return <Layers className={className} />
}

export function SetSymbol({ setCode }: { setCode: string | null }) {
  const code = String(setCode || "")
    .trim()
    .toLowerCase()

  if (!code) return <Box className="h-4 w-4 shrink-0 text-warning" />

  return (
    <span
      className="h-4 w-4 shrink-0 bg-warning"
      style={{
        mask: `url(/scryfall-assets/sets/${code}.svg) center / contain no-repeat`,
        WebkitMask: `url(/scryfall-assets/sets/${code}.svg) center / contain no-repeat`,
      }}
      title={setCode?.toUpperCase()}
      aria-hidden="true"
    />
  )
}

export function rarityColor(rarity?: string | null) {
  const key = String(rarity || "").toLowerCase()

  if (key === "mythic") return "#e46f25"
  if (key === "rare") return "#c89b3c"
  if (key === "uncommon") return "#a7b0b7"
  if (key === "special" || key === "bonus") return "#9b72d0"

  return "#f3f0e8"
}

export function ZoneIcon({ zone }: { zone: DeckZone }) {
  const className = "h-6 w-6 shrink-0 text-base-content/80"

  if (zone === "mainboard") return <Layers className={className} />
  if (zone === "sideboard") return <Box className={className} />
  if (zone === "maybeboard") return <Circle className={className} />

  return <Crown className={className} />
}

export function SparkleIcon({ className }: { className?: string }) {
  return <Star className={className} />
}

export function GameChangerBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="warning"
      title="Game Changer"
      className={cn(
        "whitespace-nowrap border-warning bg-warning px-2 text-[0.6rem] font-black uppercase tracking-[0.12em] text-warning-content shadow-sm",
        className,
      )}
    >
      Game Changer
    </Badge>
  )
}
