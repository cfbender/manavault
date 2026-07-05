import { graphql } from "../../gql"
import type {
  CollectionAutoSortRuleInput,
  CollectionAutoSortSettingsQuery,
} from "../../gql/graphql"

export type { CollectionAutoSortRuleInput }

export const BackupSettingsDocument = graphql(`
  query BackupSettings {
    backupSettings {
      enabled
      provider
      cron
      retentionCount
      s3Endpoint
      s3Bucket
      s3Region
      s3Prefix
      s3AccessKeyId
      hasS3SecretAccessKey
      googleClientId
      googleFolderId
      hasGoogleClientSecret
      hasGoogleRefreshToken
      lastBackupAt
      lastBackupStatus
      lastBackupMessage
      lastBackupPath
      lastRestoreAt
      lastRestoreStatus
      lastRestoreMessage
      pendingRestorePath
    }
  }
`)

export const CloudBackupsDocument = graphql(`
  query CloudBackups {
    cloudBackups {
      id
      name
      provider
      size
      modifiedAt
    }
  }
`)

export type CollectionAutoSortSettingsLocation = NonNullable<
  NonNullable<
    NonNullable<NonNullable<CollectionAutoSortSettingsQuery["locations"]>["edges"]>[number]
  >["node"]
>

export type CollectionAutoSortSettingsRule =
  CollectionAutoSortSettingsQuery["collectionAutoSortRules"][number]

export const CollectionAutoSortSettingsDocument = graphql(`
  query CollectionAutoSortSettings {
    collectionAutoSortRules {
      id
      name
      enabled
      priority
      targetLocation {
        id
        name
        kind
      }
      colorMode
      colors
      typeLineIncludes
      typeLineExcludes
      rarities
      minPriceCents
      maxPriceCents
      setOperator
      setCodes
      releaseDateOperator
      releaseDate
    }
    locations(first: 100) {
      edges {
        node {
          id
          name
          kind
        }
      }
    }
  }
`)

export const UpdateCollectionAutoSortRulesDocument = graphql(`
  mutation UpdateCollectionAutoSortRules($input: [CollectionAutoSortRuleInput!]!) {
    updateCollectionAutoSortRules(input: $input) {
      collectionAutoSortRules {
        id
        name
        enabled
        priority
        targetLocation {
          id
          name
          kind
        }
        colorMode
        colors
        typeLineIncludes
        typeLineExcludes
        rarities
        minPriceCents
        maxPriceCents
        setOperator
        setCodes
        releaseDateOperator
        releaseDate
      }
    }
  }
`)

export const UpdateBackupSettingsDocument = graphql(`
  mutation UpdateBackupSettings($input: BackupSettingsInput!) {
    updateBackupSettings(input: $input) {
      backupSettings {
        enabled
        provider
        cron
        retentionCount
        s3Endpoint
        s3Bucket
        s3Region
        s3Prefix
        s3AccessKeyId
        hasS3SecretAccessKey
        googleClientId
        googleFolderId
        hasGoogleClientSecret
        hasGoogleRefreshToken
        lastBackupAt
        lastBackupStatus
        lastBackupMessage
        lastBackupPath
        lastRestoreAt
        lastRestoreStatus
        lastRestoreMessage
        pendingRestorePath
      }
    }
  }
`)

export const RunCloudBackupDocument = graphql(`
  mutation RunCloudBackup {
    runCloudBackup {
      cloudBackup {
        id
        name
        provider
        status
        message
        size
        modifiedAt
      }
    }
  }
`)

export const StageCloudRestoreDocument = graphql(`
  mutation StageCloudRestore($id: ID!) {
    stageCloudRestore(id: $id) {
      restoreResult {
        status
        message
        path
      }
    }
  }
`)

export const ReloadScryfallCatalogDocument = graphql(`
  mutation ReloadScryfallCatalog {
    reloadScryfallCatalog {
      reloadResult {
        status
        message
      }
    }
  }
`)

export const ReloadScryfallAssetsDocument = graphql(`
  mutation ReloadScryfallAssets {
    reloadScryfallAssets {
      reloadResult {
        status
        message
      }
    }
  }
`)

export type Provider = "none" | "s3" | "google_drive"

export type FormState = {
  enabled: boolean
  provider: Provider
  cron: string
  retentionCount: string
  s3Endpoint: string
  s3Bucket: string
  s3Region: string
  s3Prefix: string
  s3AccessKeyId: string
  s3SecretAccessKey: string
  googleClientId: string
  googleClientSecret: string
  googleRefreshToken: string
  googleFolderId: string
}

export const initialForm: FormState = {
  enabled: false,
  provider: "none",
  cron: "0 3 * * *",
  retentionCount: "",
  s3Endpoint: "",
  s3Bucket: "",
  s3Region: "auto",
  s3Prefix: "manavault",
  s3AccessKeyId: "",
  s3SecretAccessKey: "",
  googleClientId: "",
  googleClientSecret: "",
  googleRefreshToken: "",
  googleFolderId: "",
}

export function backupSettingsInput(form: FormState) {
  return dropEmptySecrets({
    enabled: form.enabled,
    provider: form.provider,
    cron: form.cron,
    retentionCount: retentionCountInput(form.retentionCount),
    s3Endpoint: form.s3Endpoint,
    s3Bucket: form.s3Bucket,
    s3Region: form.s3Region,
    s3Prefix: form.s3Prefix,
    s3AccessKeyId: form.s3AccessKeyId,
    s3SecretAccessKey: form.s3SecretAccessKey,
    googleClientId: form.googleClientId,
    googleClientSecret: form.googleClientSecret,
    googleRefreshToken: form.googleRefreshToken,
    googleFolderId: form.googleFolderId,
  })
}

function retentionCountInput(value: string) {
  const normalized = value.trim()
  return normalized === "" ? null : Number.parseInt(normalized, 10)
}

function dropEmptySecrets(input: Record<string, unknown>) {
  for (const key of ["s3SecretAccessKey", "googleClientSecret", "googleRefreshToken"]) {
    if (typeof input[key] === "string" && input[key].trim() === "") delete input[key]
  }
  return input
}

export function providerValue(value: string): Provider {
  if (value === "s3" || value === "google_drive") return value
  return "none"
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  )
}
