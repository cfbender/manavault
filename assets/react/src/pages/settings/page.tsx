import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import type { FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "../../components/app-shell"
import { useToast } from "../../components/ui/toast"
import { pluralize, present } from "../../lib/utils"
import { AutoSortSummaryDialog } from "../collection/auto-sort-summary-dialog"
import { AutoSortCollectionDocument } from "../collection/documents"
import type { AutoSortCollectionResult } from "../collection/types"
import { BackupSettingsForm } from "./backup-settings-form"
import { CollectionAutoSortSection } from "./collection-auto-sort-section"
import { DefaultDeckTagsSection } from "./default-deck-tags-section"
import {
  BackupSettingsDocument,
  CloudBackupsDocument,
  CollectionAutoSortSettingsDocument,
  DefaultDeckTagsDocument,
  ReloadScryfallAssetsDocument,
  ReloadScryfallCatalogDocument,
  ReplaceDefaultDeckTagsDocument,
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
  type DefaultDeckTagInput,
  type FormState,
} from "./data"
import { NativeAppSection } from "./native-app-section"
import { useNativeShellSection } from "./native-shell-state"
import { RestoreSection } from "./restore-section"
import { ScryfallDataSection } from "./scryfall-data-section"
import { Alert } from "./ui"

export function SettingsPage() {
  const client = useApolloClient()
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

  const settingsQuery = useQuery(BackupSettingsDocument, {
    fetchPolicy: "cache-and-network",
  })

  const settings = settingsQuery.data?.backupSettings
  const shouldLoadBackups = !!settings && settings.provider !== "none"
  const backupsQuery = useQuery(CloudBackupsDocument, {
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
    skip: !shouldLoadBackups,
  })

  const autoSortQuery = useQuery(CollectionAutoSortSettingsDocument, {
    fetchPolicy: "cache-and-network",
  })

  const autoSortLocations: CollectionAutoSortSettingsLocation[] = useMemo(
    () => autoSortQuery.data?.locations.edges?.map((edge) => edge?.node).filter(present) ?? [],
    [autoSortQuery.data?.locations.edges],
  )
  const autoSortRules: CollectionAutoSortSettingsRule[] = useMemo(
    () => autoSortQuery.data?.collectionAutoSortRules ?? [],
    [autoSortQuery.data?.collectionAutoSortRules],
  )

  const defaultTagsQuery = useQuery(DefaultDeckTagsDocument, {
    fetchPolicy: "cache-and-network",
  })
  const defaultTags = useMemo(
    () => defaultTagsQuery.data?.defaultDeckTags ?? [],
    [defaultTagsQuery.data?.defaultDeckTags],
  )

  const backups = shouldLoadBackups ? (backupsQuery.data?.cloudBackups ?? []) : []

  useEffect(() => {
    if (!settings) return

    setForm({
      enabled: settings.enabled,
      provider: providerValue(settings.provider),
      cron: settings.cron,
      retentionCount: settings.retentionCount?.toString() ?? "",
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

  const [updateBackupSettings, saveMutation] = useMutation(UpdateBackupSettingsDocument)
  const [runCloudBackup, runMutation] = useMutation(RunCloudBackupDocument)
  const [stageCloudRestore, restoreMutation] = useMutation(StageCloudRestoreDocument)
  const [queueScryfallCatalogReload, catalogReloadMutation] = useMutation(
    ReloadScryfallCatalogDocument,
  )
  const [queueScryfallAssetReload, assetReloadMutation] = useMutation(ReloadScryfallAssetsDocument)
  const [updateCollectionAutoSortRules, autoSortMutation] = useMutation(
    UpdateCollectionAutoSortRulesDocument,
  )
  const [autoSortCollection, autoSortPreviewMutation] = useMutation(AutoSortCollectionDocument)
  const [replaceDefaultDeckTags, defaultTagsMutation] = useMutation(ReplaceDefaultDeckTagsDocument)

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    void updateBackupSettings({
      variables: { input: backupSettingsInput(form) },
      onCompleted: (data) => {
        const backupSettings = data.updateBackupSettings?.backupSettings

        setError(null)
        setMessage("Backup settings saved.")
        if (backupSettings) {
          client.writeQuery({
            query: BackupSettingsDocument,
            data: { backupSettings },
          })
        }
        void client.refetchQueries({ include: "active" })
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  function runBackup() {
    setMessage(null)
    setError(null)
    void runCloudBackup({
      variables: {},
      onCompleted: (data) => {
        setError(null)
        setMessage(data.runCloudBackup?.cloudBackup?.message ?? "Backup uploaded.")
        void client.refetchQueries({ include: "active" })
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  function stageRestore() {
    if (!restoreId) {
      setError("Choose a cloud backup to restore.")
      return
    }

    setMessage(null)
    setError(null)
    void stageCloudRestore({
      variables: { id: restoreId },
      onCompleted: (data) => {
        setError(null)
        setMessage(data.stageCloudRestore?.restoreResult?.message ?? "Restore staged.")
        void client.refetchQueries({ include: "active" })
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  function reloadScryfallCatalog() {
    setMessage(null)
    setError(null)
    void queueScryfallCatalogReload({
      variables: {},
      onCompleted: (data) => {
        setError(null)
        setMessage(
          data.reloadScryfallCatalog?.reloadResult?.message ?? "Scryfall catalog reload queued.",
        )
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  function reloadScryfallAssets() {
    setMessage(null)
    setError(null)
    void queueScryfallAssetReload({
      variables: {},
      onCompleted: (data) => {
        setError(null)
        setMessage(
          data.reloadScryfallAssets?.reloadResult?.message ?? "Scryfall asset reload queued.",
        )
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  function saveAutoSortRules(input: CollectionAutoSortRuleInput[]) {
    setMessage(null)
    setError(null)
    void updateCollectionAutoSortRules({
      variables: { input },
      onCompleted: (data) => {
        const collectionAutoSortRules = data.updateCollectionAutoSortRules?.collectionAutoSortRules

        setError(null)
        setMessage("Collection auto-sort rules saved.")
        if (collectionAutoSortRules) {
          const current = client.readQuery({ query: CollectionAutoSortSettingsDocument })

          client.writeQuery({
            query: CollectionAutoSortSettingsDocument,
            data: {
              locations: current?.locations ?? { edges: [] },
              collectionAutoSortRules,
            },
          })
        }
        void client.refetchQueries({ include: "active" })
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  function previewAutoSortRules(input: CollectionAutoSortRuleInput[]) {
    setMessage(null)
    setError(null)
    setAutoSortResult(null)
    setAutoSortPreviewInput(input)
    void autoSortCollection({
      variables: { input: { sourceLocationId: null, dryRun: true, rules: input } },
      onCompleted: (data) => {
        const result = data.autoSortCollection?.autoSortResult

        setError(null)
        setAutoSortResult(result ?? null)
      },
      onError: (err) => {
        setAutoSortResult(null)
        setError(errorMessage(err))
      },
    })
  }

  function applyAutoSortPreview() {
    if (!autoSortPreviewInput) return

    setError(null)
    void autoSortCollection({
      variables: {
        input: { sourceLocationId: null, dryRun: false, rules: autoSortPreviewInput },
      },
      onCompleted: (data) => {
        const result = data.autoSortCollection?.autoSortResult

        setError(null)
        setAutoSortResult(null)
        setMessage("Collection auto-sort complete.")
        showToast(`${pluralize(result?.movedCount ?? 0, "card")} auto-sorted`)
        void client.refetchQueries({ include: "active" })
      },
      onError: (err) => {
        setAutoSortResult(null)
        setError(errorMessage(err))
      },
    })
  }

  function showAutoSortValidationError(message: string) {
    setMessage(null)
    setError(message)
  }

  function saveDefaultDeckTags(tags: DefaultDeckTagInput[]) {
    void replaceDefaultDeckTags({
      variables: { tags },
      onCompleted: (data) => {
        const nextTags = data.replaceDefaultDeckTags?.tags

        showToast("Default tags saved.")
        if (nextTags) {
          client.writeQuery({
            query: DefaultDeckTagsDocument,
            data: { defaultDeckTags: nextTags },
          })
        }
      },
      onError: (err) => showToast(errorMessage(err)),
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Manage the mobile shell, collection auto-sort rules, cloud backups, manual restores, and Scryfall catalog maintenance."
      />

      {settingsQuery.error ? <Alert tone="error">{errorMessage(settingsQuery.error)}</Alert> : null}
      {shouldLoadBackups && backupsQuery.error ? (
        <Alert tone="error">{errorMessage(backupsQuery.error)}</Alert>
      ) : null}
      {autoSortQuery.error ? <Alert tone="error">{errorMessage(autoSortQuery.error)}</Alert> : null}
      {defaultTagsQuery.error ? (
        <Alert tone="error">{errorMessage(defaultTagsQuery.error)}</Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {nativeShell ? <NativeAppSection {...nativeSectionProps} /> : null}

      <BackupSettingsForm
        form={form}
        settings={settings}
        savePending={saveMutation.loading}
        settingsLoading={settingsQuery.loading}
        runPending={runMutation.loading}
        onSubmit={submitSettings}
        onRunBackup={runBackup}
        setFormField={setFormField}
      />

      <CollectionAutoSortSection
        isLoading={autoSortQuery.loading}
        isPreviewing={autoSortPreviewMutation.loading}
        isSaving={autoSortMutation.loading}
        locations={autoSortLocations}
        rules={autoSortRules}
        onPreview={previewAutoSortRules}
        onSave={saveAutoSortRules}
        onValidationError={showAutoSortValidationError}
      />

      <DefaultDeckTagsSection
        tags={defaultTags}
        isLoading={defaultTagsQuery.loading}
        isSaving={defaultTagsMutation.loading}
        onSave={saveDefaultDeckTags}
      />

      <AutoSortSummaryDialog
        open={Boolean(autoSortResult)}
        result={autoSortResult}
        onOpenChange={(open) => !open && setAutoSortResult(null)}
        applyPending={autoSortPreviewMutation.loading}
        onApply={autoSortPreviewInput ? applyAutoSortPreview : undefined}
      />

      <ScryfallDataSection
        catalogPending={catalogReloadMutation.loading}
        assetPending={assetReloadMutation.loading}
        onReloadCatalog={reloadScryfallCatalog}
        onReloadAssets={reloadScryfallAssets}
      />

      <RestoreSection
        backups={backups}
        provider={form.provider}
        restoreId={restoreId}
        restorePending={restoreMutation.loading}
        refreshPending={shouldLoadBackups && backupsQuery.loading}
        setRestoreId={setRestoreId}
        onStageRestore={stageRestore}
        onRefresh={() => {
          if (shouldLoadBackups) void backupsQuery.refetch()
        }}
      />
    </div>
  )

  function setFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }
}
