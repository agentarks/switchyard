# Merge And Reintegration Workflow

This document defines the adopted merge policy for bounded autonomous swarm v1 and the rollout bridge from the current implementation.

## Adopted Policy

Switchyard now adopts this merge policy:
- bounded orchestration is the near-term product target
- the `lead` owns the integration branch and integration worktree for a run
- accepted specialist output composes onto that integration branch in deterministic order
- required verification runs on that integration worktree
- the initial rollout policy is `manual-ready`
- successful swarm runs stop at a verified `merge_ready` result
- `auto-after-verify` is not active until the repo adopts it explicitly later

## Why The Gate Stays Manual First For Now

- the product direction has moved to bounded orchestration, but the runtime and operator surfaces still need to earn the right to merge automatically
- `manual-ready` keeps the final merge decision operator-visible while the orchestration model matures
- the gate preserves a clear upgrade path to `auto-after-verify` later without pretending that policy is already accepted

## Target Swarm Workflow

1. Start one run with `sy sling --task ...`.
2. Let the `lead` plan, dispatch bounded specialists, and compose accepted work onto the integration branch.
3. Verify the integrated result on the lead-owned integration worktree.
4. Stop at `merge_ready` under the default `manual-ready` policy.
5. Perform the final merge explicitly with `sy merge <run>` or normal git once the operator is satisfied.
6. Clean up preserved artifacts only after merge or explicit abandon.

## Current Implementation Bridge

The code in the repo today still uses the earlier per-session merge path:
- `sy merge <session>` merges a preserved session branch into the configured canonical branch
- `sy stop <session> --cleanup` removes preserved artifacts only after a safe merge or explicit abandon
- conflict resolution, post-merge validation, and cleanup remain explicit operator steps

That bridge remains truthful until the lead-owned integration workflow lands, but it is no longer the long-term contract.

## What This Does Not Try To Solve Yet

- automatic final merge by default
- merge queues
- AI-assisted conflict resolution
- background reintegration daemons
- broader multi-runtime merge coordination
