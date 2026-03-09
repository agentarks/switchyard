# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Clarify selector behavior in operator inspection paths.

Target outcome:
- the repo makes session selection more explicit where a raw selector could plausibly mean either a session id or an agent name
- inspection commands stay operator-readable without broad new filtering features
- docs state clearly how selector resolution works after the change

## Why This Is Next

The mail path now has both unread-consuming reads and a read-only mailbox listing path, so the next concrete operator risk is selector ambiguity.

Today `sy events <selector>` preserves orphaned event readability by preferring direct session ids before normalized agent names, but that can still surprise the operator when a raw selector could match both.

Without tightening that behavior:
- inspection output can be correct but still misleading
- operator recovery work stays harder than it needs to be
- the CLI keeps carrying an avoidable ambiguity in a core read path

## Exact Order

1. Audit the current selector paths
   - confirm which commands still have ambiguous id-vs-agent resolution
   - stay grounded in the current single-repo operator loop

2. Implement one narrow clarification
   - prefer one explicit operator-readable selector rule over broader filtering
   - keep backward compatibility when the existing behavior is already unambiguous

3. Keep the scope narrow
   - do not add dashboards, reporting, or broad query syntax
   - avoid unrelated metadata expansion unless the implementation forces it

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`
   - `docs/cli-contract.md`
   - any contract docs changed by the decision

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- background watchdogs or daemons
- automated merge queues
- AI-assisted conflict resolution
- broad multi-agent coordination logic
- post-merge dashboards or reporting

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- the repo has one concrete selector clarification that reduces operator ambiguity
- tests and docs reflect the new selector behavior
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one explicit selector rule over a broader query language
- defer richer metadata unless the current ambiguity cannot be resolved without it
- keep targeting one repo-local Codex lifecycle

The point of this slice is to make inspection behavior clearer, not to invent a broader discovery surface.
