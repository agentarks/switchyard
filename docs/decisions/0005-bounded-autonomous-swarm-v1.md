# ADR 0005: Bounded Autonomous Swarm v1

- Status: Accepted
- Date: 2026-03-19

## Context

Switchyard's original proving path focused on a narrow bounded single-agent Codex loop plus a manual-first per-session merge workflow.

That foundation is now materially real, but it no longer matches the repo's intended near-term product target. The next step is not more incremental optimization of the single-agent model. The next step is to build a bounded orchestration layer on top of the durable foundations that already exist.

The repo also needs an explicit rollout policy for merge behavior so the implementation does not silently jump from improved orchestration to automatic final merge.

## Decision

- adopt bounded orchestration as the near-term product target
- keep the host bounded for v1
- ship `manual-ready` merge policy first
- allow `auto-after-verify` only after a later explicit policy flip

## Consequences

- `sy sling` now means "start one bounded orchestration run"
- `lead`, `scout`, `builder`, and `reviewer` are first-class v1 roles
- the `lead` owns the integration branch, integration worktree, and composition step
- composition and verification should happen on the lead-owned integration branch
- the first swarm rollout should stop at a verified `merge_ready` result
- the current single-agent implementation remains a rollout bridge until later chunks land
- future work should prioritize durable orchestration state, role-aware launch, bounded host recovery, run-centric inspection, and truthful closure before broader policy expansion
