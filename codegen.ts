import type { CodegenConfig } from "@graphql-codegen/cli"

const config: CodegenConfig = {
  schema: "http://127.0.0.1:4000/api/graphql",
  documents: ["assets/react/src/**/*.{ts,tsx}"],
  ignoreNoDocuments: true,
  generates: {
    "assets/react/src/gql/": {
      preset: "client",
      config: {
        useTypeImports: true,
      },
    },
  },
}

export default config
