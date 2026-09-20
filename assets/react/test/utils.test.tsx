import { expect, test } from "vitest"
import { safeHttpUrl } from "../src/lib/utils"

test.each(["javascript:alert(1)", "data:text/html,unsafe", "//example.com/path"])(
  "rejects unsafe or non-absolute URL %s",
  (url) => {
    expect(safeHttpUrl(url)).toBeNull()
  },
)

test("allows and normalizes an absolute HTTPS URL", () => {
  expect(safeHttpUrl("https://example.com/path?q=cards")).toBe("https://example.com/path?q=cards")
})
