import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Camera, Plus } from "lucide-react"
import { PageHeader } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { graphql } from "../gql"
import { request } from "../lib/graphql"

const ScanSessionsDocument = graphql(`
  query ScanSessions {
    scanSessions {
      id
      name
      defaultCondition
      defaultLanguage
      defaultFinish
      itemCount
      reviewCount
      createdAt
    }
  }
`)

export function ScanSessionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["scan-sessions"],
    queryFn: () => request(ScanSessionsDocument),
  })

  return (
    <>
      <PageHeader
        eyebrow="ManaVault Scanner"
        title="Scan sessions"
        description="Review OCR batches and move accepted cards into the collection."
        actions={
          <Button>
            <Plus className="h-4 w-4" />
            New scan
          </Button>
        }
      />
      {isLoading ? (
        <EmptyState title="Loading scan sessions..." />
      ) : data?.scanSessions?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.scanSessions.map((session) => (
            <Link key={session.id} to="/scan-sessions/$id" params={{ id: session.id }}>
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-base-100 hover:shadow-lg">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <CardTitle className="min-w-0 truncate">{session.name}</CardTitle>
                  <Camera className="h-4 w-4 shrink-0 text-primary" />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge>{session.itemCount || 0} items</Badge>
                  <Badge tone={session.reviewCount ? "warning" : "success"}>
                    {session.reviewCount || 0} review
                  </Badge>
                  <Badge>{session.defaultFinish}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No scan sessions yet" />
      )}
    </>
  )
}

export function ScanSessionPage() {
  return (
    <>
      <PageHeader
        title="Scan session"
        description="Detailed review is queued for the mutation/camera pass."
        actions={
          <Button asChild>
            <Link to="/scan-sessions/$id/scanner" params={{ id: "0" }}>
              <Camera className="h-4 w-4" />
              Scanner
            </Link>
          </Button>
        }
      />
      <EmptyState
        title="Review UI pending"
        description="The React route is mounted; scan item mutations and camera capture are the next parity slice."
      />
    </>
  )
}

export function ScannerPage() {
  return (
    <>
      <PageHeader
        title="Scanner"
        description="Camera capture will reuse the existing native/PWA camera code in the next pass."
      />
      <EmptyState title="Scanner pending" />
    </>
  )
}
