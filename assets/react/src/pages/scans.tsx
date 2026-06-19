import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Bolt,
  Camera,
  Check,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { CardTile } from "../components/card-tile"
import { PageHeader } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { graphql } from "../gql"
import { cn } from "../lib/utils"
import { request } from "../lib/graphql"
import { PhoenixChannel, PhoenixSocket } from "../lib/phoenix-socket"

const CONDITIONS = [
  ["Near mint", "near_mint"],
  ["Lightly played", "lightly_played"],
  ["Moderately played", "moderately_played"],
  ["Heavily played", "heavily_played"],
  ["Damaged", "damaged"],
] as const

const FINISHES = [
  ["Nonfoil", "nonfoil"],
  ["Foil", "foil"],
  ["Etched", "etched"],
] as const

const ScanSessionsDocument = graphql(`
  query ScanSessions {
    scanSessions {
      id
      name
      defaultCondition
      defaultLanguage
      defaultFinish
      defaultLocation {
        id
        name
      }
      itemCount
      reviewCount
      createdAt
      scanItems {
        id
        status
        quantity
        condition
        language
        finish
        acceptedPrintingId
        insertedAt
        acceptedPrinting {
          scryfallId
          oracleId
          setCode
          setName
          collectorNumber
          rarity
          imageUrl
          priceText
          card {
            oracleId
            name
            typeLine
          }
        }
        location {
          id
          name
        }
      }
    }
    locations {
      id
      name
      kind
    }
  }
`)

const ScanSessionDocument = graphql(`
  query ScanSession($id: ID!) {
    scanSession(id: $id) {
      id
      name
      defaultCondition
      defaultLanguage
      defaultFinish
      defaultLocation {
        id
        name
      }
      itemCount
      reviewCount
      createdAt
      scanItems {
        id
        status
        quantity
        condition
        language
        finish
        acceptedPrintingId
        insertedAt
        acceptedPrinting {
          scryfallId
          oracleId
          setCode
          setName
          collectorNumber
          rarity
          imageUrl
          priceText
          card {
            oracleId
            name
            typeLine
          }
        }
        location {
          id
          name
        }
      }
    }
    locations {
      id
      name
      kind
    }
  }
`)

const ScanPrintingsDocument = graphql(`
  query ScanPrintings($q: String!, $limit: Int!) {
    scanPrintings(q: $q, limit: $limit) {
      scryfallId
      oracleId
      setCode
      setName
      collectorNumber
      rarity
      imageUrl
      priceText
      card {
        oracleId
        name
        typeLine
      }
    }
  }
`)

const ScanSetsDocument = graphql(`
  query ScanSets($q: String!) {
    scanSets(q: $q) {
      setCode
      setName
    }
  }
`)

const CreateScanSessionDocument = graphql(`
  mutation CreateScanSession($input: ScanSessionInput!) {
    createScanSession(input: $input) {
      id
      name
      defaultCondition
      defaultLanguage
      defaultFinish
      defaultLocation {
        id
        name
      }
      itemCount
      reviewCount
      createdAt
      scanItems {
        id
        status
        quantity
        condition
        language
        finish
        acceptedPrintingId
        insertedAt
        acceptedPrinting {
          scryfallId
          oracleId
          setCode
          setName
          collectorNumber
          rarity
          imageUrl
          priceText
          card {
            oracleId
            name
            typeLine
          }
        }
        location {
          id
          name
        }
      }
    }
  }
`)

const DeleteScanSessionDocument = graphql(`
  mutation DeleteScanSession($id: ID!) {
    deleteScanSession(id: $id) {
      id
    }
  }
`)

const CaptureScanItemDocument = graphql(`
  mutation CaptureScanItem(
    $scanSessionId: ID!
    $imageData: String!
    $force: Boolean!
    $lastOracleId: ID
    $preferFoil: Boolean!
    $setCodes: [String!]
  ) {
    captureScanItem(
      scanSessionId: $scanSessionId
      imageData: $imageData
      force: $force
      lastOracleId: $lastOracleId
      preferFoil: $preferFoil
      setCodes: $setCodes
    ) {
      outcome
      message
      scanItem {
        id
        status
        quantity
        condition
        language
        finish
        acceptedPrintingId
        insertedAt
        acceptedPrinting {
          scryfallId
          oracleId
          setCode
          setName
          collectorNumber
          rarity
          imageUrl
          priceText
          card {
            oracleId
            name
            typeLine
          }
        }
        location {
          id
          name
        }
      }
      scanSession {
        id
        name
        defaultCondition
        defaultLanguage
        defaultFinish
        defaultLocation {
          id
          name
        }
        itemCount
        reviewCount
        createdAt
        scanItems {
          id
          status
          quantity
          condition
          language
          finish
          acceptedPrintingId
          insertedAt
          acceptedPrinting {
            scryfallId
            oracleId
            setCode
            setName
            collectorNumber
            rarity
            imageUrl
            priceText
            card {
              oracleId
              name
              typeLine
            }
          }
          location {
            id
            name
          }
        }
      }
    }
  }
`)

const UpdateScanItemDocument = graphql(`
  mutation UpdateScanItem($id: ID!, $input: ScanItemUpdateInput!) {
    updateScanItem(id: $id, input: $input) {
      id
      status
      quantity
      condition
      language
      finish
      acceptedPrintingId
      insertedAt
      acceptedPrinting {
        scryfallId
        oracleId
        setCode
        setName
        collectorNumber
        rarity
        imageUrl
        priceText
        card {
          oracleId
          name
          typeLine
        }
      }
      location {
        id
        name
      }
    }
  }
`)

const DeleteScanItemDocument = graphql(`
  mutation DeleteScanItem($id: ID!) {
    deleteScanItem(id: $id) {
      id
    }
  }
`)

const SetScanItemPrintingDocument = graphql(`
  mutation SetScanItemPrinting($id: ID!, $scryfallId: ID!) {
    setScanItemPrinting(id: $id, scryfallId: $scryfallId) {
      id
      status
      quantity
      condition
      language
      finish
      acceptedPrintingId
      insertedAt
      acceptedPrinting {
        scryfallId
        oracleId
        setCode
        setName
        collectorNumber
        rarity
        imageUrl
        priceText
        card {
          oracleId
          name
          typeLine
        }
      }
      location {
        id
        name
      }
    }
  }
`)

const MoveScanSessionItemsDocument = graphql(`
  mutation MoveScanSessionItems($id: ID!, $locationId: ID) {
    moveScanSessionItems(id: $id, locationId: $locationId) {
      moved
      skipped
      locationId
    }
  }
`)

type Printing = {
  scryfallId: string
  oracleId: string
  setCode?: string | null
  setName?: string | null
  collectorNumber?: string | null
  rarity?: string | null
  imageUrl?: string | null
  priceText?: string | null
  card?: {
    oracleId: string
    name: string
    typeLine?: string | null
  } | null
}

type ScanItem = {
  id: string
  status: string
  quantity: number
  condition: string
  language: string
  finish: string
  acceptedPrintingId?: string | null
  insertedAt?: string | null
  acceptedPrinting?: Printing | null
  location?: {
    id: string
    name: string
  } | null
}

type ScanSession = {
  id: string
  name: string
  defaultCondition: string
  defaultLanguage: string
  defaultFinish: string
  defaultLocation?: {
    id: string
    name: string
  } | null
  itemCount?: number | null
  reviewCount?: number | null
  createdAt?: string | null
  scanItems: ScanItem[]
}

type ScanCaptureResult = {
  outcome: string
  message: string
  scanItem?: ScanItem | null
  scanSession: ScanSession
}

type LocationOption = {
  id: string
  name: string
  kind: string
}

export function ScanEntryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState("Opening scanner...")

  const { data, isLoading } = useQuery({
    queryKey: ["scan-sessions"],
    queryFn: () => request(ScanSessionsDocument),
  })

  const createSession = useMutation({
    mutationFn: () =>
      request(CreateScanSessionDocument, {
        input: {
          name: "",
          defaultCondition: "near_mint",
          defaultLanguage: "en",
          defaultFinish: "nonfoil",
          defaultLocationId: null,
        },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
      const id = result.createScanSession?.id
      if (id) navigate({ to: "/scan-sessions/$id/scanner", params: { id } })
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not start scan."),
  })
  const startedRef = useRef(false)

  useEffect(() => {
    if (isLoading || createSession.isPending || startedRef.current) return
    startedRef.current = true
    if (data?.scanSessions?.length) {
      navigate({ to: "/scan-sessions" })
      return
    }
    createSession.mutate()
  }, [createSession, data?.scanSessions?.length, isLoading, navigate])

  return <EmptyState title={message} />
}

export function ScanSessionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["scan-sessions"],
    queryFn: () => request(ScanSessionsDocument),
  })

  const createSession = useMutation({
    mutationFn: () =>
      request(CreateScanSessionDocument, {
        input: {
          name: "",
          defaultCondition: "near_mint",
          defaultLanguage: "en",
          defaultFinish: "nonfoil",
          defaultLocationId: null,
        },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
      const id = result.createScanSession?.id
      if (id) navigate({ to: "/scan-sessions/$id/scanner", params: { id } })
    },
  })

  function startScan() {
    if (data?.scanSessions?.length) {
      navigate({ to: "/scan-sessions" })
      return
    }

    createSession.mutate()
  }

  return (
    <>
      <PageHeader
        eyebrow="ManaVault Scanner"
        title="Scan sessions"
        description="Create scan batches with inventory defaults before recognition or review."
        actions={
          <Button onClick={startScan} disabled={createSession.isPending || isLoading}>
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
                  <div className="min-w-0">
                    <CardTitle className="truncate">{session.name}</CardTitle>
                    <p className="mt-1 truncate text-sm text-base-content/65">
                      {humanize(session.defaultCondition)}, {session.defaultLanguage},{" "}
                      {humanize(session.defaultFinish)}
                    </p>
                  </div>
                  <Camera className="h-4 w-4 shrink-0 text-primary" />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge>{session.itemCount || 0} items</Badge>
                  <Badge tone={session.reviewCount ? "warning" : "success"}>
                    {session.reviewCount || 0} review
                  </Badge>
                  <Badge>{session.defaultLocation?.name || "No location"}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : createSession.error ? (
        <EmptyState
          title="Could not start scan"
          description={
            createSession.error instanceof Error
              ? createSession.error.message
              : String(createSession.error)
          }
          action={
            <Button onClick={startScan}>
              <Camera className="h-4 w-4" />
              Try again
            </Button>
          }
        />
      ) : (
        <EmptyState
          title="No scan sessions yet"
          action={
            <Button onClick={startScan} disabled={createSession.isPending}>
              <Camera className="h-4 w-4" />
              Start scan
            </Button>
          }
        />
      )}
    </>
  )
}

export function ScanSessionPage() {
  const { id } = useParams({ from: "/scan-sessions/$id" })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingItem, setEditingItem] = useState<ScanItem | null>(null)
  const [changingItem, setChangingItem] = useState<ScanItem | null>(null)
  const [bulkLocationId, setBulkLocationId] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["scan-session", id],
    queryFn: () => request(ScanSessionDocument, { id }),
  })
  const session = data?.scanSession

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["scan-session", id] })
    queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
  }

  const deleteSession = useMutation({
    mutationFn: () => request(DeleteScanSessionDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
      navigate({ to: "/scan-sessions" })
    },
  })
  const moveSession = useMutation({
    mutationFn: () =>
      request(MoveScanSessionItemsDocument, {
        id,
        locationId: bulkLocationId === "" ? null : bulkLocationId,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      const locationId = result.moveScanSessionItems?.locationId
      if (locationId) {
        navigate({ to: "/collection/locations/$id", params: { id: locationId } })
      } else {
        navigate({ to: "/collection", search: { location_id: "unfiled" } })
      }
    },
  })

  if (isLoading) return <EmptyState title="Loading scan session..." />
  if (!session) return <EmptyState title="Scan session not found" />

  return (
    <>
      <Link to="/scan-sessions" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold">
        <ArrowLeft className="h-4 w-4" />
        Back to scan sessions
      </Link>

      <PageHeader
        eyebrow="Scan session"
        title={session.name}
        description={`${humanize(session.defaultCondition)}, ${session.defaultLanguage}, ${humanize(
          session.defaultFinish,
        )} - ${session.defaultLocation?.name || "No location"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              className="select select-bordered select-sm"
              value={bulkLocationId}
              onChange={(event) => setBulkLocationId(event.target.value)}
            >
              <option value="">No location</option>
              {data?.locations
                .filter((location) => location.id !== "unfiled")
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
            </select>
            <Button
              disabled={!session.scanItems.length || moveSession.isPending}
              size="sm"
              onClick={() => moveSession.mutate()}
            >
              Move cards
            </Button>
            <Button asChild size="sm">
              <Link to="/scan-sessions/$id/scanner" params={{ id }}>
                <Camera className="h-4 w-4" />
                Scan
              </Link>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm("Discard this scan session and all scanned cards?")) {
                  deleteSession.mutate()
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      {session.scanItems.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,13.5rem))] justify-center gap-5">
          {session.scanItems.map((item) => (
            <ScanItemTile
              key={item.id}
              item={item}
              onChangePrinting={() => setChangingItem(item)}
              onDelete={() => refresh()}
              onEdit={() => setEditingItem(item)}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No cards have been scanned in this session yet." />
      )}

      <EditScanItemDialog item={editingItem} onClose={() => setEditingItem(null)} onSaved={refresh} />
      <ChangePrintingDialog
        item={changingItem}
        onClose={() => setChangingItem(null)}
        onSaved={refresh}
      />
    </>
  )
}

export function ScannerPage() {
  const { id } = useParams({ from: "/scan-sessions/$id/scanner" })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState("Starting camera...")
  const [preferFoil, setPreferFoil] = useState(false)
  const [lockedSets, setLockedSets] = useState<Array<{ setCode: string; setName?: string | null }>>(
    [],
  )
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ScanItem | null>(null)
  const [changingItem, setChangingItem] = useState<ScanItem | null>(null)
  const scannerChannelRef = useRef<PhoenixChannel | null>(null)
  const recentItemsRef = useRef<HTMLDivElement | null>(null)
  const previousRecentItemIdsRef = useRef<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ["scan-session", id],
    queryFn: () => request(ScanSessionDocument, { id }),
  })
  const session = data?.scanSession
  const recentItems = useMemo(() => session?.scanItems.slice(0, 12) || [], [session?.scanItems])
  const recentItemIds = useMemo(() => recentItems.map((item) => item.id), [recentItems])
  const lastOracleId = recentItems[0]?.acceptedPrinting?.card?.oracleId || null

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["scan-session", id] })
    queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
  }

  const applyCaptureResult = useCallback(
    (payload: ScanCaptureResult | null | undefined) => {
      if (!payload) return
      setMessage(payload.message)
      queryClient.setQueryData(["scan-session", id], {
        scanSession: payload.scanSession,
        locations: data?.locations || [],
      })
      queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
    },
    [data?.locations, id, queryClient],
  )

  useEffect(() => {
    let cancelled = false
    const socket = new PhoenixSocket("/socket")
    const channel = socket.channel(`scanner:${id}`)
    scannerChannelRef.current = null

    socket
      .connect()
      .then(() => channel.join())
      .then(() => {
        if (cancelled) return
        scannerChannelRef.current = channel
      })
      .catch(() => {
        if (cancelled) return
        scannerChannelRef.current = null
      })

    return () => {
      cancelled = true
      scannerChannelRef.current = null
      socket.disconnect()
    }
  }, [id])

  useEffect(() => {
    const previousIds = previousRecentItemIdsRef.current
    const addedId = recentItemIds.find((itemId) => !previousIds.includes(itemId))
    previousRecentItemIdsRef.current = recentItemIds

    if (!addedId || !previousIds.length) return

    recentItemsRef.current
      ?.querySelector<HTMLElement>(`[data-scan-item-id="${CSS.escape(addedId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [recentItemIds])

  const capture = useMutation({
    mutationFn: async ({ imageData, force }: { imageData: string; force: boolean }) => {
      const payload = {
        imageData,
        force,
        lastOracleId,
        preferFoil,
        setCodes: lockedSets.map((set) => set.setCode),
      }
      const channel = scannerChannelRef.current
      if (channel) {
        try {
          return await channel.push<ScanCaptureResult>("capture", payload)
        } catch (_error) {
          scannerChannelRef.current = null
        }
      }

      const result = await request(CaptureScanItemDocument, {
        scanSessionId: id,
        imageData,
        force,
        lastOracleId,
        preferFoil,
        setCodes: lockedSets.map((set) => set.setCode),
      })
      return result.captureScanItem
    },
    onSuccess: applyCaptureResult,
    onError: (error) => {
      setMessage("No card was added.")
    },
  })
  const handleCapture = useCallback(
    (imageData: string, force: boolean) => capture.mutate({ imageData, force }),
    [capture],
  )

  if (isLoading) return <EmptyState title="Loading scanner..." />
  if (!session) return <EmptyState title="Scan session not found" />

  return (
    <div className="flex min-h-full w-full flex-col items-center gap-2">
      <header className="hidden w-full max-w-3xl items-center gap-2 sm:flex">
        <Button asChild size="icon" variant="ghost" aria-label="Back to scan session">
          <Link to="/scan-sessions/$id" params={{ id }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-black leading-tight tracking-normal">Scan cards</h1>
          <p className="truncate text-xs text-base-content/65">{session.name}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/scan-sessions/$id" params={{ id }}>
            Review
          </Link>
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            if (confirm("Discard this scan session and all scanned cards?")) {
              request(DeleteScanSessionDocument, { id }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["scan-sessions"] })
                navigate({ to: "/scan-sessions" })
              })
            }
          }}
        >
          Discard
        </Button>
      </header>

      <ScannerCamera
        activeOptions={preferFoil || lockedSets.length > 0}
        busy={capture.isPending}
        message={message}
        onCameraError={() => undefined}
        onCameraStatus={setMessage}
        onCapture={handleCapture}
        onOptions={() => setOptionsOpen(true)}
        outcome={capture.data?.outcome}
      />

      <section className="w-full max-w-3xl rounded-xl border border-base-300 bg-base-100 p-2 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Scanned cards</h2>
          <Badge>{recentItems.length}</Badge>
        </div>
        {recentItems.length ? (
          <div ref={recentItemsRef} className="flex snap-x gap-3 overflow-x-auto pb-4">
            {recentItems.map((item) => (
              <RecentScanItem
                key={item.id}
                item={item}
                onEdit={() => setEditingItem(item)}
                onSaved={refresh}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-xs">
            Matched cards appear here as you scan.
          </div>
        )}
      </section>

      <ScannerOptionsDialog
        lockedSets={lockedSets}
        onClose={() => setOptionsOpen(false)}
        onLockedSetsChange={setLockedSets}
        onPreferFoilChange={setPreferFoil}
        open={optionsOpen}
        preferFoil={preferFoil}
      />
      <EditScanItemDialog
        item={editingItem}
        onChangePrinting={() => {
          if (editingItem) setChangingItem(editingItem)
          setEditingItem(null)
        }}
        onClose={() => setEditingItem(null)}
        onSaved={refresh}
      />
      <ChangePrintingDialog
        item={changingItem}
        onClose={() => setChangingItem(null)}
        onSaved={refresh}
      />
    </div>
  )
}

function ScannerCamera({
  activeOptions,
  busy,
  message,
  onCameraError,
  onCameraStatus,
  onCapture,
  onOptions,
  outcome,
}: {
  activeOptions: boolean
  busy: boolean
  message: string
  onCameraError: (message: string | null) => void
  onCameraStatus: (message: string) => void
  onCapture: (imageData: string, force: boolean) => void
  onOptions: () => void
  outcome?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const devicesRef = useRef<MediaDeviceInfo[]>([])
  const deviceIndexRef = useRef(0)
  const captureInFlightRef = useRef(false)
  const blockedUntilRef = useRef(0)
  const lastCaptureAtRef = useRef(0)
  const forceNextRef = useRef(false)
  const onCaptureRef = useRef(onCapture)
  const onCameraErrorRef = useRef(onCameraError)
  const onCameraStatusRef = useRef(onCameraStatus)
  const [cameraVersion, setCameraVersion] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    onCaptureRef.current = onCapture
    onCameraErrorRef.current = onCameraError
    onCameraStatusRef.current = onCameraStatus
  }, [onCameraError, onCameraStatus, onCapture])

  useEffect(() => {
    captureInFlightRef.current = busy
  }, [busy])

  useEffect(() => {
    if (outcome === "accepted") {
      captureInFlightRef.current = false
      blockedUntilRef.current = 0
      forceNextRef.current = false
      playDing()
    } else if (outcome === "duplicate") {
      captureInFlightRef.current = false
      blockedUntilRef.current = Date.now() + 1800
      forceNextRef.current = false
    } else if (outcome === "rejected" || outcome === "error") {
      captureInFlightRef.current = false
      blockedUntilRef.current = Date.now() + 1400
      forceNextRef.current = false
    }
  }, [outcome])

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!window.isSecureContext) {
        onCameraErrorRef.current(
          "Camera access requires HTTPS on phones. Open ManaVault over HTTPS or use localhost on this device.",
        )
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        onCameraErrorRef.current("This browser does not support camera capture.")
        return
      }

      try {
        setStarted(false)
        onCameraStatusRef.current("Starting camera...")
        await refreshDevices()
        await startCameraStream()
        if (cancelled) return
        setStarted(true)
        onCameraErrorRef.current(null)
        onCameraStatusRef.current("Camera is running. OCR scanning...")
        timerRef.current = window.setInterval(captureFrame, 300)
        window.setTimeout(captureFrame, 250)
      } catch (error) {
        onCameraErrorRef.current(cameraErrorMessage(error))
      }
    }

    async function refreshDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        devicesRef.current = devices.filter((device) => device.kind === "videoinput")
      } catch (_error) {
        devicesRef.current = []
      }
    }

    async function startCameraStream() {
      stopCamera()
      const device = devicesRef.current[deviceIndexRef.current]
      const constraints = device?.deviceId
        ? { deviceId: { exact: device.deviceId } }
        : { facingMode: { ideal: "environment" } }
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch (_error) {
          onCameraStatusRef.current("Camera is ready. Tap the preview if scanning does not start.")
        }
      }
    }

    function captureFrame() {
      const now = Date.now()
      if (captureInFlightRef.current || now < blockedUntilRef.current) return
      if (now - lastCaptureAtRef.current < 250) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !streamRef.current || !video.videoWidth || !video.videoHeight) return

      captureInFlightRef.current = true
      lastCaptureAtRef.current = now
      const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
      onCaptureRef.current(canvas.toDataURL("image/jpeg", 0.82), forceNextRef.current)
    }

    function stopCamera() {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }

    start()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [cameraVersion])

  async function switchCamera() {
    if (devicesRef.current.length < 2) {
      onCameraStatus("No alternate camera is available.")
      return
    }
    deviceIndexRef.current = (deviceIndexRef.current + 1) % devicesRef.current.length
    setCameraVersion((version) => version + 1)
  }

  function forceCapture() {
    forceNextRef.current = true
    blockedUntilRef.current = 0
    onCameraStatus("Force scanning the preview once...")
  }

  return (
    <section className="scanner-camera-panel w-full max-w-3xl overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl">
      <div
        className="relative aspect-[3/4] max-h-[calc(100svh-10.75rem)] min-h-[20rem] bg-neutral text-neutral-content sm:max-h-[calc(100svh-17rem)]"
        onClick={forceCapture}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setStarted(true)}
          onPlaying={() => setStarted(true)}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!started ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-neutral/70 p-6 text-center">
            <div className="grid gap-3">
              <Camera className="mx-auto h-8 w-8" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation()
                  setCameraVersion((version) => version + 1)
                }}
              >
                Start camera
              </Button>
            </div>
          </div>
        ) : null}
        <div className="absolute left-3 top-3 z-20">
          <Button
            type="button"
            size="icon"
            variant={activeOptions ? "default" : "secondary"}
            onClick={(event) => {
              event.stopPropagation()
              onOptions()
            }}
            aria-label="Scanner options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-7 sm:p-10">
          <div className="h-full w-full rounded-[1.35rem] border-4 border-primary/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
        </div>
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation()
              switchCamera()
            }}
            aria-label="Switch camera"
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="secondary" disabled aria-label="Flashlight">
            <Bolt className="h-4 w-4" />
          </Button>
        </div>
        {outcome === "duplicate" ? (
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-lg bg-black/60 px-3 py-2 text-center text-xs font-semibold text-white shadow backdrop-blur">
            Tap to add another copy.
          </div>
        ) : null}
      </div>
      <div className="sr-only" aria-live="polite">
        {message}
      </div>
    </section>
  )
}

function RecentScanItem({
  item,
  onEdit,
  onSaved,
}: {
  item: ScanItem
  onEdit: () => void
  onSaved: () => void
}) {
  const updateItem = useMutation({
    mutationFn: (input: { quantity?: number; finish?: string }) =>
      request(UpdateScanItemDocument, { id: item.id, input }),
    onSuccess: onSaved,
  })
  const quantity = item.quantity || 1

  return (
    <div className="relative w-28 shrink-0 snap-start sm:w-32" data-scan-item-id={item.id}>
      <div className="relative">
        <ScanItemTile item={item} showMenu={false} />
        <div className="absolute bottom-3 left-1 right-1 z-30 flex items-center justify-between gap-0.5 sm:bottom-4 sm:left-1.5 sm:right-1.5">
          <div className="flex h-5 items-center gap-0.5 rounded-full bg-black/55 p-0.5 text-white shadow backdrop-blur sm:h-6">
            <button
              type="button"
              className="grid h-4 w-4 place-items-center rounded-full border-0 bg-white/15 p-0 text-white hover:bg-white/25 disabled:bg-white/10 disabled:text-white/40 sm:h-5 sm:w-5"
              aria-label="Decrease quantity"
              disabled={quantity <= 1 || updateItem.isPending}
              onClick={() => updateItem.mutate({ quantity: Math.max(quantity - 1, 1) })}
            >
              <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </button>
            <span className="min-w-3 text-center text-[0.68rem] font-bold leading-none sm:min-w-4 sm:text-xs">
              x{quantity}
            </span>
            <button
              type="button"
              className="grid h-4 w-4 place-items-center rounded-full border-0 bg-white/15 p-0 text-white hover:bg-white/25 disabled:bg-white/10 disabled:text-white/40 sm:h-5 sm:w-5"
              aria-label="Increase quantity"
              disabled={updateItem.isPending}
              onClick={() => updateItem.mutate({ quantity: quantity + 1 })}
            >
              <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </button>
          </div>
          <div className="flex h-5 items-center gap-0.5 sm:h-6">
            <button
              type="button"
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border-0 p-0 shadow backdrop-blur sm:h-6 sm:w-6",
                item.finish === "foil"
                  ? "bg-primary text-primary-content hover:bg-primary/90"
                  : "bg-black/55 text-white hover:bg-black/70",
              )}
              aria-label="Toggle foil"
              onClick={() =>
                updateItem.mutate({ finish: item.finish === "foil" ? "nonfoil" : "foil" })
              }
            >
              <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </button>
            <button
              type="button"
              className="grid h-5 w-5 place-items-center rounded-full border-0 bg-black/55 p-0 text-white shadow backdrop-blur hover:bg-black/70 sm:h-6 sm:w-6"
              aria-label="Edit scanned card"
              onClick={(event) => {
                event.stopPropagation()
                onEdit()
              }}
              onPointerUp={(event) => {
                event.stopPropagation()
                onEdit()
              }}
            >
              <Pencil className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ScanItemTile({
  item,
  onChangePrinting,
  onDelete,
  onEdit,
  showMenu = true,
}: {
  item: ScanItem
  onChangePrinting?: () => void
  onDelete?: () => void
  onEdit?: () => void
  showMenu?: boolean
}) {
  const deleteItem = useMutation({
    mutationFn: () => request(DeleteScanItemDocument, { id: item.id }),
    onSuccess: onDelete,
  })
  const printing = item.acceptedPrinting

  return (
    <CardTile
      count={item.quantity}
      defaultActions={[
        { icon: <Pencil className="h-4 w-4" />, label: "Edit", onClick: onEdit },
        {
          icon: <Search className="h-4 w-4" />,
          label: "Change card/printing",
          onClick: onChangePrinting,
        },
        {
          destructive: true,
          icon: <Trash2 className="h-4 w-4" />,
          label: "Delete",
          onClick: () => {
            if (confirm("Delete this scanned card?")) deleteItem.mutate()
          },
        },
      ]}
      finish={item.finish}
      growOnHover={showMenu}
      imageUrl={printing?.imageUrl}
      location={item.location?.name}
      name={printing?.card?.name || `Scan item #${item.id}`}
      price={printing?.priceText}
      rarity={printing?.rarity}
      setCode={printing?.setCode}
      setLabel={printing?.setCode?.toUpperCase()}
      setName={printing ? `${printing.setCode?.toUpperCase()} ${printing.collectorNumber || ""}` : undefined}
      showMenu={showMenu}
      typeLine={printing?.card?.typeLine || item.status}
    />
  )
}

function NewScanSessionDialog({
  error,
  locations,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  error: unknown
  locations: LocationOption[]
  onClose: () => void
  onSubmit: (input: {
    name: string
    defaultCondition: string
    defaultLanguage: string
    defaultFinish: string
    defaultLocationId: string | null
  }) => void
  open: boolean
  pending: boolean
}) {
  const [condition, setCondition] = useState("near_mint")
  const [language, setLanguage] = useState("en")
  const [finish, setFinish] = useState("nonfoil")
  const [locationId, setLocationId] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSubmit({
      name: String(form.get("name") || ""),
      defaultCondition: condition,
      defaultLanguage: language,
      defaultFinish: finish,
      defaultLocationId: locationId || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-xl" labelledBy="new-scan-session-title">
        <DialogHeader>
          <DialogTitle id="new-scan-session-title">New scan session</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <form className="grid gap-4 p-5" onSubmit={submit}>
          <label className="form-control">
            <span className="label-text">Name</span>
            <input className="input input-bordered" name="name" placeholder="Generated from today" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Default condition" value={condition} onChange={setCondition} options={CONDITIONS} />
            <label className="form-control">
              <span className="label-text">Default language</span>
              <input
                className="input input-bordered"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              />
            </label>
            <Select label="Default finish" value={finish} onChange={setFinish} options={FINISHES} />
            <label className="form-control">
              <span className="label-text">Default location</span>
              <select
                className="select select-bordered"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">No default location</option>
                {locations
                  .filter((location) => location.id !== "unfiled")
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {error ? <p className="text-sm text-error">{error instanceof Error ? error.message : String(error)}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={pending} type="submit">
              Create scan session
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditScanItemDialog({
  item,
  onChangePrinting,
  onClose,
  onSaved,
}: {
  item: ScanItem | null
  onChangePrinting: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const updateItem = useMutation({
    mutationFn: (input: {
      quantity: number
      condition: string
      language: string
      finish: string
    }) => request(UpdateScanItemDocument, { id: item?.id || "", input }),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  if (!item) return null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updateItem.mutate({
      quantity: Number(form.get("quantity") || 1),
      condition: String(form.get("condition") || "near_mint"),
      language: String(form.get("language") || "en"),
      finish: String(form.get("finish") || "nonfoil"),
    })
  }

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="fixed inset-0 flex h-[100svh] w-screen max-w-none flex-col rounded-none border-0 sm:relative sm:inset-auto sm:h-auto sm:w-full sm:max-w-lg sm:rounded-box sm:border"
        labelledBy="edit-scan-item-title"
      >
        <DialogHeader>
          <DialogTitle id="edit-scan-item-title">Edit scanned card</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <form className="grid gap-3 overflow-y-auto p-5 text-sm" onSubmit={submit}>
          <Button type="button" variant="outline" onClick={onChangePrinting}>
            <Search className="h-4 w-4" />
            Change card/printing
          </Button>
          <label className="form-control">
            <span className="label-text">Quantity</span>
            <input
              className="input input-bordered"
              name="quantity"
              type="number"
              min="1"
              defaultValue={item.quantity}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Condition" name="condition" defaultValue={item.condition} options={CONDITIONS} />
            <Select label="Finish" name="finish" defaultValue={item.finish} options={FINISHES} />
          </div>
          <label className="form-control">
            <span className="label-text">Language</span>
            <input className="input input-bordered" name="language" defaultValue={item.language} />
          </label>
          {updateItem.error ? (
            <p className="text-sm text-error">
              {updateItem.error instanceof Error ? updateItem.error.message : String(updateItem.error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={updateItem.isPending} type="submit">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ChangePrintingDialog({
  item,
  onClose,
  onSaved,
}: {
  item: ScanItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [query, setQuery] = useState("")
  const queryText = query || item?.acceptedPrinting?.card?.name || ""
  const { data } = useQuery({
    enabled: Boolean(item),
    queryKey: ["scan-printings", queryText],
    queryFn: () => request(ScanPrintingsDocument, { q: queryText, limit: 36 }),
  })
  const setPrinting = useMutation({
    mutationFn: (scryfallId: string) =>
      request(SetScanItemPrintingDocument, { id: item?.id || "", scryfallId }),
    onSuccess: () => {
      onSaved()
      onClose()
      setQuery("")
    },
  })

  if (!item) return null

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-3xl flex-col"
        labelledBy="change-scan-printing-title"
      >
        <DialogHeader>
          <DialogTitle id="change-scan-printing-title">Change card/printing</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <form
          className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(String(new FormData(event.currentTarget).get("q") || ""))
          }}
        >
          <input
            className="input input-bordered w-full"
            name="q"
            defaultValue={queryText}
            type="search"
            autoComplete="off"
            placeholder="Card name or printing"
          />
          <Button type="submit">Search</Button>
        </form>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]">
            {(data?.scanPrintings || []).map((printing) => (
              <button
                key={printing.scryfallId}
                type="button"
                className="relative text-left"
                disabled={printing.scryfallId === item.acceptedPrintingId || setPrinting.isPending}
                onClick={() => setPrinting.mutate(printing.scryfallId)}
              >
                <CardTile
                  finish={item.finish}
                  imageUrl={printing.imageUrl}
                  name={printing.card?.name || "Card"}
                  price={printing.priceText}
                  rarity={printing.rarity}
                  setCode={printing.setCode}
                  setName={`${printing.setCode?.toUpperCase()} ${printing.collectorNumber || ""}`}
                  showMenu={false}
                  typeLine={printing.card?.typeLine}
                />
                {printing.scryfallId === item.acceptedPrintingId ? (
                  <span className="absolute bottom-2 left-2 z-30 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[0.68rem] font-bold leading-none text-primary-content shadow">
                    <Check className="h-3 w-3" />
                    Current
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ScannerOptionsDialog({
  lockedSets,
  onClose,
  onLockedSetsChange,
  onPreferFoilChange,
  open,
  preferFoil,
}: {
  lockedSets: Array<{ setCode: string; setName?: string | null }>
  onClose: () => void
  onLockedSetsChange: (sets: Array<{ setCode: string; setName?: string | null }>) => void
  onPreferFoilChange: (preferFoil: boolean) => void
  open: boolean
  preferFoil: boolean
}) {
  const [query, setQuery] = useState("")
  const [isSetComboboxOpen, setIsSetComboboxOpen] = useState(false)
  const [activeSetIndex, setActiveSetIndex] = useState(-1)
  const setComboboxRef = useRef<HTMLDivElement | null>(null)
  const { data } = useQuery({
    enabled: open && query.trim().length > 0,
    queryKey: ["scan-sets", query],
    queryFn: () => request(ScanSetsDocument, { q: query }),
  })
  const lockedSetCodes = new Set(lockedSets.map((set) => set.setCode))
  const setOptions = (data?.scanSets || []).filter((set) => !lockedSetCodes.has(set.setCode))
  const showSetOptions = isSetComboboxOpen && setOptions.length > 0

  useEffect(() => {
    setActiveSetIndex(-1)
  }, [query, setOptions.length])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!setComboboxRef.current?.contains(event.target as Node)) setIsSetComboboxOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function addSet(set: { setCode: string; setName?: string | null }) {
    onLockedSetsChange(
      [set, ...lockedSets]
        .filter((candidate, index, all) => all.findIndex((other) => other.setCode === candidate.setCode) === index)
        .sort((a, b) => `${a.setName || ""}${a.setCode}`.localeCompare(`${b.setName || ""}${b.setCode}`)),
    )
    setQuery("")
    setIsSetComboboxOpen(false)
    setActiveSetIndex(-1)
  }

  function updateSetQuery(value: string) {
    setQuery(value)
    setIsSetComboboxOpen(value.trim().length > 0)
  }

  function handleSetKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsSetComboboxOpen(false)
      return
    }

    if (!showSetOptions) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveSetIndex((index) => (index + 1) % setOptions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveSetIndex((index) => (index <= 0 ? setOptions.length - 1 : index - 1))
    } else if (event.key === "Enter" && activeSetIndex >= 0) {
      event.preventDefault()
      addSet(setOptions[activeSetIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-xl overflow-visible" labelledBy="scanner-options-title">
        <DialogHeader>
          <DialogTitle id="scanner-options-title">Scanner options</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <div className="grid gap-5 p-5">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-base-300 bg-base-100 p-3">
            <span className="font-semibold">Prefer foil</span>
            <input
              type="checkbox"
              checked={preferFoil}
              onChange={(event) => onPreferFoilChange(event.target.checked)}
              className="toggle toggle-primary"
            />
          </label>
          <div className="space-y-3">
            <h3 className="font-semibold">Lock to sets</h3>
            <div ref={setComboboxRef} className="relative">
              <input
                className="input input-bordered w-full"
                type="search"
                value={query}
                onChange={(event) => updateSetQuery(event.target.value)}
                onFocus={() => setIsSetComboboxOpen(query.trim().length > 0)}
                onKeyDown={handleSetKeyDown}
                autoComplete="off"
                placeholder="Set name or code"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSetOptions}
              />
              {showSetOptions ? (
                <div
                  className="absolute left-0 right-0 top-full z-[1200] grid max-h-72 gap-1 overflow-y-auto rounded-b-box border border-t-0 border-base-300 bg-base-100 p-2 shadow-2xl"
                  role="listbox"
                >
                  {setOptions.map((set, index) => (
                    <button
                      key={set.setCode}
                      type="button"
                      role="option"
                      aria-selected={index === activeSetIndex}
                      className={cn(
                        "grid min-h-10 grid-cols-[1rem_auto_minmax(0,1fr)] items-center gap-2 rounded-btn px-3 py-2 text-left text-sm transition-colors",
                        index === activeSetIndex
                          ? "bg-primary text-primary-content"
                          : "hover:bg-base-200",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addSet(set)}
                    >
                      <ScanSetIcon setCode={set.setCode} className="h-4 w-4 bg-current" />
                      <span className="font-bold">{set.setCode.toUpperCase()}</span>
                      <span className="truncate">{set.setName}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {lockedSets.length ? (
              <div className="flex flex-wrap gap-2">
                {lockedSets.map((set) => (
                  <Badge key={set.setCode} tone="primary" className="gap-1.5">
                    <ScanSetIcon setCode={set.setCode} className="h-3.5 w-3.5 bg-current" />
                    <span>{setLabel(set)}</span>
                    <button
                      type="button"
                      className="ml-1"
                      aria-label={`Remove ${setLabel(set)}`}
                      onClick={() =>
                        onLockedSetsChange(lockedSets.filter((locked) => locked.setCode !== set.setCode))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-base-content/60">No set lock</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Select({
  defaultValue,
  label,
  name,
  onChange,
  options,
  value,
}: {
  defaultValue?: string
  label: string
  name?: string
  onChange?: (value: string) => void
  options: readonly (readonly [string, string])[]
  value?: string
}) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <select
        className="select select-bordered"
        defaultValue={defaultValue}
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function humanize(value?: string | null) {
  if (!value) return ""
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase())
}

function setLabel(set: { setCode: string; setName?: string | null }) {
  return set.setName ? `${set.setCode.toUpperCase()} - ${set.setName}` : set.setCode.toUpperCase()
}

function ScanSetIcon({ className, setCode }: { className?: string; setCode?: string | null }) {
  const code = String(setCode || "")
    .trim()
    .toLowerCase()

  if (!code) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-current/30 text-[0.5rem] font-black leading-none",
          className,
        )}
      >
        ?
      </span>
    )
  }

  return (
    <span
      className={cn("inline-block shrink-0", className)}
      style={{
        mask: `url(/scryfall-assets/sets/${code}.svg) center / contain no-repeat`,
        WebkitMask: `url(/scryfall-assets/sets/${code}.svg) center / contain no-repeat`,
      }}
      title={setCode?.toUpperCase()}
      aria-hidden="true"
    />
  )
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError") return "Camera permission was denied."
  if (name === "NotFoundError") return "No camera was found on this device."
  if (name === "NotReadableError") return "Camera is already in use by another app."
  if (name === "OverconstrainedError") return "Requested camera is not available."
  return "Camera could not be started."
}

let audioCtx: AudioContext | null = null

async function playDing() {
  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  audioCtx = audioCtx || new AudioContextClass()
  if (audioCtx.state === "suspended") await audioCtx.resume()
  const oscillator = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18)
  oscillator.connect(gain)
  gain.connect(audioCtx.destination)
  oscillator.start()
  oscillator.stop(audioCtx.currentTime + 0.2)
}
