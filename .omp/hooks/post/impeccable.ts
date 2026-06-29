import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks"

import { runHook, writeAuditLog } from "../../../.agents/skills/impeccable/scripts/hook-lib.mjs"

const TOOL_NAMES: Record<string, true> = {
  Edit: true,
  Write: true,
  apply_patch: true,
  edit: true,
  write: true,
}

type ToolResultEvent = {
  toolName?: string
  tool_name?: string
  input?: Record<string, unknown>
  toolInput?: Record<string, unknown>
  tool_input?: Record<string, unknown>
  args?: Record<string, unknown>
  arguments?: Record<string, unknown>
  filePath?: string
  file_path?: string
  cwd?: string
  sessionId?: string
  session_id?: string
  content?: unknown
  details?: unknown
  isError?: boolean
}

type TextBlock = { type: "text"; text: string }

function contentBlocks(content: unknown): unknown[] {
  if (Array.isArray(content)) return content
  if (content == null) return []
  if (typeof content === "string") return [{ type: "text", text: content } satisfies TextBlock]
  return [content]
}

function additionalContext(stdout: string | undefined): string | null {
  const raw = String(stdout || "").trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as {
      additionalContext?: string
      additional_context?: string
      hookSpecificOutput?: { additionalContext?: string }
    }
    return (
      parsed.hookSpecificOutput?.additionalContext ||
      parsed.additionalContext ||
      parsed.additional_context ||
      null
    )
  } catch {
    return raw
  }
}

export default function impeccableHook(pi: HookAPI) {
  pi.on("tool_result", async (event: ToolResultEvent) => {
    const toolName = event.toolName || event.tool_name || ""
    if (!TOOL_NAMES[toolName]) return

    const cwd = event.cwd || pi.cwd || process.cwd()
    const input: Record<string, unknown> = {}
    for (const candidate of [
      event.arguments,
      event.args,
      event.tool_input,
      event.toolInput,
      event.input,
    ]) {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        Object.assign(input, candidate)
      }
    }
    const filePath = event.filePath || event.file_path
    if (filePath && typeof input.file_path !== "string" && typeof input.path !== "string") {
      input.file_path = filePath
    }

    const hookEvent = {
      session_id: event.sessionId || event.session_id || "omp",
      cwd,
      tool_name: toolName,
      tool_input: input,
      file_path: filePath,
    }

    const result = await runHook({
      stdinJson: JSON.stringify(hookEvent),
      env: process.env,
      cwd,
    })
    writeAuditLog(process.env, result.audit, cwd)

    const context = additionalContext(result.stdout)
    if (!context) return

    return {
      content: [
        ...contentBlocks(event.content),
        { type: "text", text: context } satisfies TextBlock,
      ],
      details: event.details,
      isError: event.isError,
    }
  })
}
