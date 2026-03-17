# Slice Ledger

This ledger is the canonical count of completed Switchyard implementation slices.

- Count only implementation slices that materially changed the repo-local operator loop.
- Do not count spec-only or doc-only follow-ups as separate slices; fold them into the implementation row they support.
- Rows `S01` through `S09` are best-effort reconstructions from milestone docs and git history; rows `S10+` follow explicit slice artifacts and are canonical.
- Headline total: `14` counted implementation slices.

| SEQ | DATE | SLUG | SUMMARY | ARTIFACTS | NOTES |
| --- | --- | --- | --- | --- | --- |
| S01 | 2026-03-07 | `project-scaffold` | Scaffolded the TypeScript CLI foundation, shared types, and repo workflow docs. | [PLAN](../PLAN.md); [milestones](milestones.md); PR #1; PR #2 | Best-effort reconstruction for M1. |
| S02 | 2026-03-07 | `repo-bootstrap` | Added `sy init`, repo-root detection, config loading, and the repo-local `.switchyard/` bootstrap. | [milestones](milestones.md); PR #1 | Best-effort reconstruction for M2; early scaffold work overlaps this row. |
| S03 | 2026-03-07 | `session-persistence` | Added durable session storage and the first real `sy status` path. | [milestones](milestones.md); PR #3 | Best-effort reconstruction for M3. |
| S04 | 2026-03-07 | `agent-spawn` | Added isolated worktree launch flow and the first real `sy sling` path. | [milestones](milestones.md); PR #4 | Best-effort reconstruction for M4. |
| S05 | 2026-03-07 | `lifecycle-control` | Added `sy stop` and the first cleanup-aware lifecycle controls. | [milestones](milestones.md); PR #5 | Best-effort reconstruction for M5. |
| S06 | 2026-03-08 | `messaging` | Added durable agent mail plus the core `sy mail send`, `sy mail check`, and `sy mail list` loop. | [milestones](milestones.md); PR #6; PR #17; PR #20 | Best-effort reconstruction for M6; later pre-ledger mail ergonomics such as unread-only views, body framing, and file-backed bodies are folded into this row. |
| S07 | 2026-03-08 | `observability` | Added durable lifecycle events plus CLI inspection through `sy events` and richer `sy status` context. | [milestones](milestones.md); PR #7; PR #8 | Best-effort reconstruction for M7; readiness, event-context, and exact-session inspection hardening before explicit slice plans is folded into this row. |
| S08 | 2026-03-08 | `merge-workflow` | Added the first narrow reintegration path with `sy merge` and cleanup safety around preserved worktrees. | [milestones](milestones.md); PR #15; PR #16 | Best-effort reconstruction for M8; later merge, selector, and cleanup hardening before the explicit slice-plan cadence is folded into this row. |
| S09 | 2026-03-11 | `run-tracking-control-plane` | Made concurrent task ownership materially real with durable runs, all-session task ownership, next-step hints, mail-aware follow-up, concurrent-workflow proof, and freshness ordering in `sy status`. | PR #62; PR #63; PR #64; PR #65; PR #66; PR #67; PR #68; PR #69 | Best-effort reconstructed control-plane cluster immediately before explicit slice plans became the norm. |
| S10 | 2026-03-11 | `stalled-session-status` | Surfaced passive stalled-session visibility in `sy status` without mutating durable lifecycle state. | [plan](plans/2026-03-11-stalled-session-status.md); [spec](specs/2026-03-11-stalled-session-status-design.md); PR #71; PR #72 | First row backed by an explicit plan/spec pair. |
| S11 | 2026-03-11 | `no-visible-progress-status` | Surfaced `runtime.no_visible_progress` hints when live sessions still had no visible repo or mail progress. | [spec](specs/2026-03-11-no-visible-progress-status-design.md); PR #75 | Canonical from explicit design plus implementation history; no separate implementation plan was written for this slice. |
| S12 | 2026-03-11 | `detached-runtime-logs` | Added durable detached runtime transcript capture plus the first-class `sy logs <session>` inspection path. | [plan](plans/2026-03-12-detached-runtime-logs.md); [spec](specs/2026-03-12-detached-runtime-logs-design.md); PR #77 | `sy logs` output hardening in PR #78 is folded into this implementation row. |
| S13 | 2026-03-13 | `bounded-codex-exec-runtime` | Replaced the detached interactive launch path with bounded `codex exec --json` runs and truthful natural completion handling. | [plan](plans/2026-03-12-codex-exec-runtime.md); [spec](specs/2026-03-12-codex-exec-runtime-design.md); PR #80 | [Runtime smoke-validation docs](plans/2026-03-13-runtime-smoke-validation-docs.md) are supporting evidence for this row, not a separate counted slice. |
| S14 | 2026-03-13 | `runtime-default-and-cleanup-safety` | Made bounded launches writable by default and failed cleanup readiness closed when preserved worktree inspection was unsafe. | [plan](plans/2026-03-13-runtime-default-and-cleanup-safety.md); PR #81 | Narrow post-runtime implementation slice focused on launch defaults and cleanup inspection. |
