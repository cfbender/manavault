---
id: TASK-37
title: Make orb setup non-interactive and worktree-clean
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-05 01:40'
updated_date: '2026-08-05 01:42'
labels: []
dependencies: []
references:
  - .agents/setup
  - mix.exs
  - AGENTS.md
  - .gitignore
modified_files:
  - .agents/setup
  - .gitignore
  - AGENTS.md
  - mix.exs
type: bug
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fresh orb setup currently invokes the interactive Impeccable installer through mix setup. Harness auto-detection writes Claude, Codex, and GitHub support files into the repository and modifies tracked settings. First-time agents also try Backlog and aube before entering the mise environment. Make orb provisioning deterministic, Amp-specific, and explicit about mise-managed commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fresh orb setup installs Impeccable only for the Amp-compatible .agents provider without generating hook or cross-harness files
- [x] #2 Fresh orb setup installs the Backlog CLI and documents mise-prefixed Backlog and aube invocation
- [x] #3 The existing generated Impeccable paths no longer appear as worktree changes
- [x] #4 Setup and resume scripts remain executable, idempotent, and pass shell syntax checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the cross-harness Impeccable install from the generic Mix setup alias and install it explicitly for the Codex/.agents provider in orb setup with hooks disabled.
2. Install the mise-managed Backlog tool during first-time orb setup and add durable command guidance for agents.
3. Ignore only Impeccable-generated cross-harness paths and remove its generated hook block from tracked local Claude settings.
4. Verify shell syntax, permissions, setup convergence where practical, and worktree cleanliness.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause was the generic Mix setup alias invoking Impeccable without provider or scope flags. Impeccable auto-detected every harness directory and installed cross-harness skills and hooks. The installer now runs only from orb setup with --providers=codex, --scope=project, and --no-hooks; the generic Mix setup no longer installs agent tooling. The setup also installs npm:backlog.md and writes one idempotent ManaVault guidance block to Amp's AGENTS.md directing agents to mise exec -- backlog and mise exec -- aube. Legacy generated paths are narrowly ignored and the generated tracked Claude hook change was removed.

Validation: an isolated install generated only .agents; setup completed successfully twice; resume completed; the guidance marker remained singular; setup/resume retained executable bits and passed bash -n; a clean login shell resolved mise-prefixed Backlog and aube; Mix formatting and git diff checks passed; generated cross-harness paths no longer appear in normal git status.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made fresh orb setup deterministic and worktree-clean by moving Impeccable out of mix setup, targeting only Amp's .agents provider without hooks, installing Backlog through mise, and adding mise-prefixed agent guidance. Verified with an isolated installer run, two complete setup runs, resume, clean-shell tool checks, syntax/permission checks, and worktree inspection.
<!-- SECTION:FINAL_SUMMARY:END -->
