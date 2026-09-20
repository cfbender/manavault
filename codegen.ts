import type { CodegenConfig } from "@graphql-codegen/cli"

const config: CodegenConfig = {
  schema: process.env.GRAPHQL_SCHEMA_URL || "_build/graphql-schema.graphql",
  documents: ["assets/react/src/**/*.{ts,tsx}"],
  ignoreNoDocuments: true,
  generates: {
    "assets/react/src/gql/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        useTypeImports: true,
      },
    },
  },
}

export default config
