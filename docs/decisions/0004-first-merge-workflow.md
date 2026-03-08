# ADR 0004: First Merge Workflow

## Status

Accepted

## Context

Switchyard now supports the core repo-local operator loop:
- `sy sling` creates a deterministic `agents/*` branch and a repo-local worktree
- `sy status` and `sy events` expose enough durable state to understand what happened
- `sy stop` can stop the runtime while preserving the worktree by default or removing it with `--cleanup`

That made the next lifecycle gap explicit: there was still no defined answer for how useful work on an agent branch returns to the canonical branch.

Two risks followed from that gap:
- cleanup remained ambiguous because `sy stop --cleanup` deletes the branch and worktree that would otherwise be merged
- any future merge command would be forced to invent operator rules that had not been written down yet

## Decision

For the first merge slice, Switchyard will define a manual-first reintegration contract before adding a merge command.

Working rule:
- stop active sessions without `--cleanup` until the operator has either merged or abandoned the branch
- review the preserved branch and worktree with normal git and project checks
- perform the actual reintegration from the canonical branch with an explicit git merge
- run `sy stop <session> --cleanup` only after merge success or an explicit abandon decision

Command boundary:
- Switchyard owns session state, event inspection, and cleanup of preserved artifacts
- Git owns content inspection, conflict handling, and the actual merge mechanics for now

The documented merge shape is:

```bash
git switch <canonical-branch>
git merge --no-ff agents/<agent-name>
```

## Consequences

Positive:
- gives operators one explicit post-run workflow instead of leaving reintegration implied
- explains why `sy stop` preserves the worktree by default
- creates a concrete contract for a future `sy merge` command to automate

Negative:
- reintegration is still manual and requires the operator to use git directly
- cleanup before merge remains a destructive operator choice until a merge command adds stronger preflight checks
- conflict reporting stays in git rather than Switchyard for now

## Follow-Up

The next merge-adjacent slice should implement the smallest `sy merge` path that follows this contract instead of redesigning the workflow again.
