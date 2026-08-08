import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["assets/react/test/**/*.test.tsx"],
    setupFiles: ["assets/react/test/setup.ts"],
  },
})
