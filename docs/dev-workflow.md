# Dev Workflow

repo-workflow-startup: repo-workflow-v1

This is a repo-workflow startup doc.
Canonical repo-workflow state lives in `docs/repo-workflow/*.yaml`; the prose docs help operators understand that state but do not replace it.

This file is the recommended owner workflow for a normal Switchyard coding session.

## Start Of Session

1. At the start of a milestone bundle, or when scope changes, read:
   - `docs/repo-workflow/campaign.yaml`
   - `docs/repo-workflow/chunks.yaml`
   - `docs/repo-workflow/attempts.yaml`
   - `docs/current-state.md`
   - `docs/next-steps.md`
   - `docs/backlog.md`
   - `docs/focus-tracker.md`

2. If the task touches behavior or architecture, also read:
   - `docs/cli-contract.md`
   - relevant files under `docs/decisions/`

3. Run:
   - `npm install` if dependencies changed
   - `npm run repo-workflow:validate` when resuming from a clean checkpoint
   - `npm run check`

4. Write or load one active execution checklist for the milestone bundle.

If `npm run check` does not pass at milestone start, fix or understand that first before expanding scope.
If `npm run repo-workflow:validate` fails, reconcile the repo-workflow startup docs or canonical YAML before continuing.

## During The Session

Use this order:
1. make the next planned change that advances the active milestone bundle
2. add or update tests
3. run the relevant checks at bundle checkpoints
4. update docs when project state or workflow meaning changes
5. run 3 independent subagent reviews on the current diff for any material change
6. fix or reconcile any non-trivial findings
7. rerun enough independent subagent reviews to get 3 clean results on the updated state before calling the work review-clean, implementation-ready, or merge-ready

Default rule:
- if you fix a bug, add a regression test
- if you change behavior, update the CLI contract or current-state docs
- if you make a durable technical choice, update or add an ADR
- do not stop to re-triage the next tiny task when the active milestone bundle is already defined
- treat specs, plans, workflow docs, architecture docs, and merge/PR process changes as material changes, not just code changes
- independent means 3 distinct reviewer identities; one reviewer reused multiple times does not satisfy the gate
- timeout or no-response from a reviewer does not count as approval
- treat correctness, contract mismatch, behavioral regression, missing verification, unsafe workflow behavior, scope violation, and ambiguity that changes the effective contract, test oracle, or implementation path as non-trivial findings
- pure wording preferences or clearly advisory suggestions are not blocking by themselves
- if 3 independent review-capable subagents are unavailable, the session cannot advance a material change to review-clean, implementation-ready, or merge-ready; surface the constraint and stop instead of using a weaker fallback

## End Of Session

Before you consider the session done:
1. run `npm run check`
2. review `git diff`
3. update the docs that changed in meaning
4. confirm that 3 independent subagent reviews returned clean on the current state for any material change
5. confirm the current milestone bundle is complete or name the remaining checklist items
6. send a PR for the completed milestone bundle
7. include example output in the PR description for any operator-facing behavior or CLI output you changed

## If You Only Have 30-60 Minutes

Prefer one of these:
- add a failing test and make it pass
- complete one store function and its test
- replace one placeholder behavior with a minimal real behavior
- update one decision doc after a real implementation choice

Do not start a broad new subsystem unless you can keep it inside the active milestone bundle.

## Scope Control

Ask these questions before adding complexity:
- does this help the first `init -> status -> sling -> stop` loop?
- does this reduce a real known risk?
- can this be tested in this session?

If the answer is no to all three, defer it.

Also check `docs/focus-tracker.md` before starting work that introduces a new subsystem or a broader UI surface.
