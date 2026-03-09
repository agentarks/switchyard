# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Add end-to-end regression coverage around `sy init`.

Target outcome:
- the repo bootstrap contract is covered by one realistic CLI-path test
- root resolution, config creation, and bootstrap layout stay locked down as the operator loop evolves
- the slice reduces risk without broadening product scope

## Why This Is Next

The current merge inspection gap is resolved narrowly enough: dirty merge preflights now surface the blocking git status entries instead of only saying “not clean.”

That means the next smallest meaningful risk is bootstrap confidence. `sy init` establishes the repo-local contract the rest of the operator loop depends on, but it still has no end-to-end coverage.

Without that coverage:
- init regressions can break the whole operator loop before later commands even start
- docs can claim bootstrap behavior that is no longer verified end to end
- future hardening work loses the narrow, contract-first focus the repo is trying to preserve

## Exact Order

1. Add one realistic `sy init` path test
   - invoke the command the way an operator would
   - assert the config file and bootstrap layout that matter to later commands

2. Keep the assertions contract-focused
   - cover root resolution and bootstrap outputs
   - avoid speculative checks for implementation detail that operators do not rely on

3. Keep the scope narrow
   - do not broaden `sy init` behavior in the same slice unless the test exposes a real bug
   - do not mix in unrelated lifecycle features

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`
   - `docs/cli-contract.md`
   - any docs changed by the resulting contract clarification

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- broader bootstrap abstractions
- unrelated status, events, or merge reporting
- background watchdogs or daemons
- dashboard or TUI work

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- the repo has one realistic regression test around `sy init`
- tests and docs reflect the resulting bootstrap contract
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one realistic init-path assertion over a broad harness
- defer behavior changes unless the test reveals a real bootstrap bug
- keep targeting one repo-local Codex lifecycle

The point of this slice is to harden the operator loop at its entry point, not to broaden the product surface.
