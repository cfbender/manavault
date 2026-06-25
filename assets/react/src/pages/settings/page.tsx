import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "../../components/app-shell"
import { useToast } from "../../components/ui/toast"
import { request } from "../../lib/graphql"
import { pluralize, present } from "../../lib/utils"
import { AutoSortSummaryDialog } from "../collection/auto-sort-summary-dialog"
import { invalidateCollectionViews } from "../collection/collection-navigation"
import { AutoSortCollectionDocument } from "../collection/documents"
import type { AutoSortCollectionResult } from "../collection/types"
import { CollectionAutoSortSection } from "./collection-auto-sort-section"
import { BackupSettingsForm } from "./backup-settings-form"
import {
  BackupSettingsDocument,
  CloudBackupsDocument,
  CollectionAutoSortSettingsDocument,
  ReloadScryfallAssetsDocument,
  ReloadScryfallCatalogDocument,
  RunCloudBackupDocument,
  StageCloudRestoreDocument,
  UpdateBackupSettingsDocument,
  UpdateCollectionAutoSortRulesDocument,
  backupSettingsInput,
  errorMessage,
  initialForm,
  providerValue,
  type CollectionAutoSortRuleInput,
  type CollectionAutoSortSettingsLocation,
  type CollectionAutoSortSettingsRule,
  type FormState,
} from "./data"
import { NativeAppSection } from "./native-app-section"
import { useNativeShellSection } from "./native-shell-state"
import { RestoreSection } from "./restore-section"
import { ScryfallDataSection } from "./scryfall-data-section"
import { Alert } from "./ui"

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(initialForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState("")
  const [autoSortResult, setAutoSortResult] = useState<AutoSortCollectionResult | null>(null)
  const [autoSortPreviewInput, setAutoSortPreviewInput] = useState<
    CollectionAutoSortRuleInput[] | null
  >(null)
  const { nativeShell, nativeSectionProps } = useNativeShellSection()

  const settingsQuery = useQuery({
    queryKey: ["backup-settings"],
    queryFn: () => request(BackupSettingsDocument),
  })

  const settings = settingsQuery.data?.backupSettings
  const backupsQuery = useQuery({
    queryKey: ["cloud-backups", settings?.provider],
    queryFn: () => request(CloudBackupsDocument),
    enabled: !!settings && settings.provider !== "none",
  })

  const autoSortQuery = useQuery({
    queryKey: ["collection-auto-sort-settings"],
    queryFn: () => request(CollectionAutoSortSettingsDocument),
  })

  const autoSortLocations: CollectionAutoSortSettingsLocation[] = useMemo(
    () => autoSortQuery.data?.locations.edges?.map((edge) => edge?.node).filter(present) ?? [],
    [autoSortQuery.data?.locations.edges],
  )
  const autoSortRules: CollectionAutoSortSettingsRule[] = useMemo(
    () => autoSortQuery.data?.collectionAutoSortRules ?? [],
    [autoSortQuery.data?.collectionAutoSortRules],
  )

  const backups = backupsQuery.data?.cloudBackups ?? []

  useEffect(() => {
    if (!settings) return

    setForm({
      enabled: settings.enabled,
      provider: providerValue(settings.provider),
      cron: settings.cron,
      s3Endpoint: settings.s3Endpoint ?? "",
      s3Bucket: settings.s3Bucket ?? "",
      s3Region: settings.s3Region ?? "auto",
      s3Prefix: settings.s3Prefix ?? "manavault",
      s3AccessKeyId: settings.s3AccessKeyId ?? "",
      s3SecretAccessKey: "",
      googleClientId: settings.googleClientId ?? "",
      googleClientSecret: "",
      googleRefreshToken: "",
      googleFolderId: settings.googleFolderId ?? "",
    })
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => request(UpdateBackupSettingsDocument, { input: backupSettingsInput(form) }),
    onSuccess: async (data) => {
      const backupSettings = data.updateBackupSettings?.backupSettings

      setError(null)
      setMessage("Backup settings saved.")
      if (backupSettings) {
        queryClient.setQueryData(["backup-settings"], { backupSettings })
      }
      await queryClient.invalidateQueries({ queryKey: ["backup-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["cloud-backups"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const runMutation = useMutation({
    mutationFn: () => request(RunCloudBackupDocument),
    onSuccess: async (data) => {
      setError(null)
      setMessage(data.runCloudBackup?.cloudBackup?.message ?? "Backup uploaded.")
      await queryClient.invalidateQueries({ queryKey: ["backup-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["cloud-backups"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => request(StageCloudRestoreDocument, { id }),
    onSuccess: async (data) => {
      setError(null)
      setMessage(data.stageCloudRestore?.restoreResult?.message ?? "Restore staged.")
      await queryClient.invalidateQueries({ queryKey: ["backup-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["cloud-backups"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const catalogReloadMutation = useMutation({
    mutationFn: () => request(ReloadScryfallCatalogDocument),
    onSuccess: (data) => {
      setError(null)
      setMessage(data.reloadScryfallCatalog?.reloadResult?.message ?? "Scryfall catalog reload queued.")
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const assetReloadMutation = useMutation({
    mutationFn: () => request(ReloadScryfallAssetsDocument),
    onSuccess: (data) => {
      setError(null)
      setMessage(data.reloadScryfallAssets?.reloadResult?.message ?? "Scryfall asset reload queued.")
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const autoSortMutation = useMutation({
    mutationFn: (input: CollectionAutoSortRuleInput[]) =>
      request(UpdateCollectionAutoSortRulesDocument, { input }),
    onSuccess: async (data) => {
      const collectionAutoSortRules = data.updateCollectionAutoSortRules?.collectionAutoSortRules

      setError(null)
      setMessage("Collection auto-sort rules saved.")
      if (collectionAutoSortRules) {
        queryClient.setQueryData(["collection-auto-sort-settings"], (current: typeof autoSortQuery.data) => ({
          locations: current?.locations ?? { edges: [] },
          collectionAutoSortRules,
        }))
      }
      await queryClient.invalidateQueries({ queryKey: ["collection-auto-sort-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["collection"] })
      await queryClient.invalidateQueries({ queryKey: ["collection-item-form-options"] })
      await queryClient.invalidateQueries({ queryKey: ["location"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const autoSortPreviewMutation = useMutation({
    mutationFn: ({ dryRun, rules }: { dryRun: boolean; rules: CollectionAutoSortRuleInput[] }) =>
      request(AutoSortCollectionDocument, { input: { sourceLocationId: null, dryRun, rules } }),
    onSuccess: async (data, input) => {
      const result = data.autoSortCollection?.autoSortResult

      setError(null)
      if (!input.dryRun) {
        setAutoSortResult(null)
        setMessage("Collection auto-sort complete.")
        showToast(`${pluralize(result?.movedCount ?? 0, "card")} auto-sorted`)
        invalidateCollectionViews(queryClient)
        await queryClient.invalidateQueries({ queryKey: ["location"] })
      } else {
        setAutoSortResult(result ?? null)
      }
    },
    onError: (err) => {
      setAutoSortResult(null)
      setError(errorMessage(err))
    },
  })

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    saveMutation.mutate()
  }

  function runBackup() {
    setMessage(null)
    setError(null)
    runMutation.mutate()
  }

  function stageRestore() {
    if (!restoreId) {
      setError("Choose a cloud backup to restore.")
      return
    }

    setMessage(null)
    setError(null)
    restoreMutation.mutate(restoreId)
  }

  function reloadScryfallCatalog() {
    setMessage(null)
    setError(null)
    catalogReloadMutation.mutate()
  }

  function reloadScryfallAssets() {
    setMessage(null)
    setError(null)
    assetReloadMutation.mutate()
  }

  function saveAutoSortRules(input: CollectionAutoSortRuleInput[]) {
    setMessage(null)
    setError(null)
    autoSortMutation.mutate(input)
  }

  function previewAutoSortRules(input: CollectionAutoSortRuleInput[]) {
    setMessage(null)
    setError(null)
    setAutoSortResult(null)
    setAutoSortPreviewInput(input)
    autoSortPreviewMutation.mutate({ dryRun: true, rules: input })
  }

  function applyAutoSortPreview() {
    if (!autoSortPreviewInput) return

    setError(null)
    autoSortPreviewMutation.mutate({ dryRun: false, rules: autoSortPreviewInput })
  }

  function showAutoSortValidationError(message: string) {
    setMessage(null)
    setError(message)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Manage the mobile shell, collection auto-sort rules, cloud backups, manual restores, and Scryfall catalog maintenance."
      />

      {settingsQuery.isError ? (
        <Alert tone="error">{errorMessage(settingsQuery.error)}</Alert>
      ) : null}
      {backupsQuery.isError ? <Alert tone="error">{errorMessage(backupsQuery.error)}</Alert> : null}
      {autoSortQuery.isError ? <Alert tone="error">{errorMessage(autoSortQuery.error)}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {nativeShell ? <NativeAppSection {...nativeSectionProps} /> : null}

      <BackupSettingsForm
        form={form}
        settings={settings}
        savePending={saveMutation.isPending}
        settingsLoading={settingsQuery.isLoading}
        runPending={runMutation.isPending}
        onSubmit={submitSettings}
        onRunBackup={runBackup}
        setFormField={setFormField}
      />

      <CollectionAutoSortSection
        isLoading={autoSortQuery.isLoading}
        isPreviewing={autoSortPreviewMutation.isPending}
        isSaving={autoSortMutation.isPending}
        locations={autoSortLocations}
        rules={autoSortRules}
        onPreview={previewAutoSortRules}
        onSave={saveAutoSortRules}
        onValidationError={showAutoSortValidationError}
      />

      <AutoSortSummaryDialog
        open={Boolean(autoSortResult)}
        result={autoSortResult}
        onOpenChange={(open) => !open && setAutoSortResult(null)}
        applyPending={autoSortPreviewMutation.isPending}
        onApply={autoSortPreviewInput ? applyAutoSortPreview : undefined}
      />

      <ScryfallDataSection
        catalogPending={catalogReloadMutation.isPending}
        assetPending={assetReloadMutation.isPending}
        onReloadCatalog={reloadScryfallCatalog}
        onReloadAssets={reloadScryfallAssets}
      />

      <RestoreSection
        backups={backups}
        provider={form.provider}
        restoreId={restoreId}
        restorePending={restoreMutation.isPending}
        refreshPending={backupsQuery.isFetching}
        setRestoreId={setRestoreId}
        onStageRestore={stageRestore}
        onRefresh={() => backupsQuery.refetch()}
      />
    </div>
  )

  function setFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }
}
