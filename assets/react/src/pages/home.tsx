import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Boxes, Camera, Layers, Search } from "lucide-react"
import { PageHeader } from "../components/app-shell"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
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
  const { data, isError, isLoading } = useQuery({ queryKey: ["home"], queryFn: () => request(HomeDocument) })
  const summary = data?.homeSummary

  const stats = [
    { label: "Cards stored", value: summary?.collectionCount, icon: Boxes, to: "/collection" as const },
    { label: "Locations", value: summary?.locationCount, icon: Boxes, to: "/collection" as const },
    { label: "Decks", value: summary?.deckCount, icon: Layers, to: "/decks" as const },
    { label: "Scan sessions", value: summary?.scanSessionCount, icon: Camera, to: "/scan-sessions" as const },
  ]

  return (
    <>
      <PageHeader
        title="Library overview"
        description="Track local cards, scan batches, storage locations, and deck allocation from one self-hosted database."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/cards">
                <Search className="h-4 w-4" />
                Find cards
              </Link>
            </Button>
            <Button asChild>
              <Link to="/scan-sessions">
                <Camera className="h-4 w-4" />
                Scan cards
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <Link key={stat.label} to={stat.to}>
            <Card className="h-full transition-colors hover:bg-base-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-base-content/70">{stat.label}</CardTitle>
                <stat.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{isLoading ? "..." : isError ? "!" : compactNumber(stat.value)}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
