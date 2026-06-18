import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Boxes, Camera, Layers, Search } from "lucide-react"
import { useState } from "react"
import { ActionCard } from "../components/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { compactNumber } from "../lib/utils"

const HomeDocument = graphql(`
  query Home {
    homeSummary {
      collectionCount
      locationCount
      deckCount
      scanSessionCount
    }
  }
`)

export function HomePage() {
  const [q, setQ] = useState("")
  const { data, isError, isLoading } = useQuery({ queryKey: ["home"], queryFn: () => request(HomeDocument) })
  const summary = data?.homeSummary

  const value = (count?: number | null) => (isLoading ? "..." : isError ? "!" : compactNumber(count))

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <motion.section
        className="card border border-base-300 bg-base-200 shadow-xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="card-body gap-6 p-6 sm:p-8">
          <div className="badge badge-primary badge-outline uppercase">ManaVault</div>
          <div>
            <h1 className="max-w-3xl text-5xl font-black tracking-normal sm:text-6xl">Your Magic collection, organized.</h1>
            <p className="mt-5 text-xl leading-8 text-base-content/70">Jump into your collection, build decks, or search the local card catalog.</p>
          </div>

          <form className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
            <label className="fieldset p-0">
              <span className="fieldset-label text-base">Search cards</span>
              <div className="control-toolbar grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input name="q" value={q} onChange={event => setQ(event.target.value)} placeholder="Black Lotus" />
                <Button asChild>
                  <Link to="/cards" search={{ q: q.trim() || undefined }}>
                    <Search className="h-4 w-4" />
                    Search
                  </Link>
                </Button>
              </div>
            </label>
          </form>
        </div>
      </motion.section>

      <div className="grid gap-5 md:grid-cols-3">
        <ActionCard
          to="/collection"
          icon={<Boxes className="h-12 w-12 text-accent" />}
          badge={`${value(summary?.collectionCount)} cards`}
          title="Collection"
          description="Browse boxes, binders, lists, and unfiled cards."
        />
        <ActionCard
          to="/decks"
          icon={<Layers className="h-12 w-12 text-warning" />}
          badge={`${value(summary?.deckCount)} decks`}
          badgeTone="accent"
          title="Decks"
          description="Create decks, import lists, and organize zones."
        />
        <ActionCard
          to="/scan-sessions"
          icon={<Camera className="h-12 w-12 text-secondary" />}
          badge={`${value(summary?.scanSessionCount)} scans`}
          badgeTone="secondary"
          title="Scan sessions"
          description="Capture cards with your camera and review matches."
        />
      </div>
    </div>
  )
}
