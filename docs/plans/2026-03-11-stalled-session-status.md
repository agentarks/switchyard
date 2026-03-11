# Stalled Session Status Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passive stalled-session visibility to `sy status` so quiet active sessions surface as `inspect` without mutating durable lifecycle state or hiding better diagnostics.

**Architecture:** Keep the slice inside the existing `src/commands/status.ts` control plane. Derive a separate idle clock from agent/runtime-side activity, then thread that derived stalled hint into follow-up selection and recent-summary rendering while preserving the current `UPDATED` timestamp and recent-event precedence rules.

**Tech Stack:** TypeScript, Node.js, built-in `node:test`, existing Switchyard session/event/mail/run stores

---

## File Structure

**Modify:**
- `src/commands/status.ts`
- `src/commands/status.test.ts`
- `src/mail/store.ts`
- `src/mail/store.test.ts`
- `docs/cli-contract.md`
- `docs/current-state.md`

**Create:**
- none

**Why these files:**
- `src/commands/status.ts` already owns row derivation, follow-up selection, recent-summary selection, and selected-session detail rendering.
- `src/commands/status.test.ts` already contains the regression coverage for `NEXT`, `RECENT`, unread-mail precedence, and lifecycle reconciliation.
- `src/mail/store.ts` is the smallest place to add a latest-inbound-mail query without broadening the mail command surface.
- `src/mail/store.test.ts` should lock down the new mail query semantics so status does not accidentally treat operator-authored or read-state-only activity as agent progress.
- `docs/cli-contract.md` is the operator-facing behavior contract for `sy status`.
- `docs/current-state.md` should reflect the new blind-spot slice once behavior lands.

## Chunk 1: Status-Derived Stalled Hint

### Task 1: Add failing stall-detection tests

**Files:**
- Modify: `src/commands/status.test.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Write the failing all-session stalled-session tests**

Add focused tests near the other `statusCommand` follow-up and recent-summary coverage for:

```ts
test("statusCommand marks a quiet running session as inspect when agent activity is older than the stalled threshold", async () => {
  // session.state === "running"
  // runtime liveness stays alive
  // latest runtime-side event is older than 30 minutes
  // expect NEXT=inspect
  // expect RECENT to append runtime.stalled idleFor=...
});

test("statusCommand marks a quiet starting session as inspect when startup activity is older than the stalled threshold", async () => {
  // session.state === "starting"
  // no reconcile-to-running or reconcile-to-failed transition
  // latest startup-side activity is older than 10 minutes
  // expect NEXT=inspect
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm test -- src/commands/status.test.ts
```

Expected:
- FAIL because stalled-session behavior does not exist yet
- existing non-stalled tests remain green

- [ ] **Step 3: Write the failing precedence and idle-clock tests**

Add tests for the review-backed edge cases:

```ts
test("statusCommand does not let operator-only activity reset the stalled idle clock", async () => {
  // newer mail.sent or mail.checked event exists
  // older runtime.ready event remains the latest agent/runtime activity
  // expect stalled follow-up still wins over wait
});

test("statusCommand preserves a higher-value concrete recent summary and appends the stalled hint", async () => {
  // recent merge.failed or stop.failed stays the RECENT base text
  // stalled hint is appended instead of replacing it
});

test("statusCommand keeps unread inbound operator mail as the higher-priority next action even when the session is stalled", async () => {
  // unread inbound mail exists
  // session also crosses stalled threshold
  // expect NEXT=mail
});
```

- [ ] **Step 4: Run the targeted tests again to verify the new cases fail for the right reason**

Run:

```bash
npm test -- src/commands/status.test.ts
```

Expected:
- FAIL on the newly added stalled-session expectations
- no unrelated regressions introduced by the test setup

- [ ] **Step 5: Commit the failing-test checkpoint**

```bash
git add src/commands/status.test.ts
git commit -m "test: add stalled status expectations"
```

### Task 2: Implement the stalled hint in `sy status`

**Files:**
- Modify: `src/mail/store.ts`
- Modify: `src/mail/store.test.ts`
- Modify: `src/commands/status.ts`
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Add the minimal mail-store query for latest inbound non-operator activity**

Add a focused store helper and tests, for example:

```ts
export async function listLatestInboundMailBySession(
  projectRoot: string,
  sessionIds: string[],
  options: { excludeSender?: string } = {}
): Promise<Map<string, MailRecord>>
```

Behavior:
- return the newest mail row per requested session
- support excluding operator-authored mail via `excludeSender: "operator"`
- do not filter on `read_at`, because already-read inbound mail still counts as agent progress for the stalled idle clock

Add store tests that verify:
- newest inbound non-operator mail is returned per session
- operator-authored mail can be excluded
- read mail still participates in the result when it is the newest inbound non-operator message

- [ ] **Step 2: Run the targeted mail-store tests to verify the helper passes before wiring status**

Run:

```bash
npm test -- src/mail/store.test.ts
```

Expected:
- PASS for the new store helper coverage
- PASS for existing mail-store regressions

- [ ] **Step 3: Add explicit derived status metadata for stalled detection**

Refactor the row context shape so status rendering has both:
- the existing operator-visible freshness timestamp for `UPDATED`
- a separate derived stalled hint payload for idle-clock calculations and summary formatting

The implementation should introduce helpers with narrow responsibilities, for example:

```ts
interface DerivedStalledHint {
  idleSince: string;
  idleForMs: number;
}

function deriveStalledHint(options: {
  session: SessionRecord;
  recentEvent?: EventRecord;
  latestInboundMail?: MailRecord;
  now: string;
}): DerivedStalledHint | undefined
```

and

```ts
function deriveAgentActivityTimestamp(
  session: SessionRecord,
  recentEvent: EventRecord | undefined,
  latestInboundMail: MailRecord | undefined
): string
```

The idle clock should:
- start from `session.createdAt`
- advance on runtime-side status events like `sling.spawned`, `sling.completed`, `sling.failed`, `runtime.ready`, `runtime.exited`, and `runtime.exited_early`
- advance on the latest inbound non-operator mail returned by the new mail-store helper
- ignore operator-only events such as `mail.sent`, `mail.checked`, and `mail.listed`

- [ ] **Step 4: Thread the stalled hint through follow-up selection**

Update the follow-up logic so:

```ts
if ((unreadCount ?? 0) > 0) return "mail";
if (stalledHint) return "inspect";
if (isActiveSessionState(session.state)) return "wait";
```

Keep all existing post-stop and post-merge follow-up rules unchanged.

- [ ] **Step 5: Thread the stalled hint through recent-summary formatting without replacing concrete diagnostics**

Replace the current recent-summary formatter signature with one that can augment the chosen base summary:

```ts
function formatRelevantRecentSummary(
  event: EventRecord | undefined,
  unreadMailSummary: UnreadMailSummary | undefined,
  stalledHint: DerivedStalledHint | undefined,
  options?: { truncate?: boolean }
): string
```

Behavior:
- choose the same base summary as today (`mail.unread` when it beats the event, otherwise the selected event summary)
- append `; runtime.stalled idleFor=<duration>` when `stalledHint` exists and a base summary already exists
- use `runtime.stalled idleFor=<duration>` by itself only when no concrete summary exists

- [ ] **Step 6: Keep selected-session output aligned with the same stalled hint**

Use the same row context for the selected-session header so:
- `Next:` shows `inspect` when stalled and no higher-priority mail follow-up exists
- `Recent:` preserves the concrete summary and appends the stalled hint when appropriate

- [ ] **Step 7: Add any small helper coverage needed to keep the implementation readable**

Keep the implementation local to `src/commands/status.ts`. Do not add new event types, schema changes, or new command flags.

- [ ] **Step 8: Run the targeted status tests to verify the implementation passes**

Run:

```bash
npm test -- src/commands/status.test.ts
```

Expected:
- PASS for the newly added stalled-session tests
- PASS for the existing `statusCommand` regressions around unread mail, blocking recent events, and lifecycle reconciliation

- [ ] **Step 9: Commit the implementation checkpoint**

```bash
git add src/mail/store.ts src/mail/store.test.ts src/commands/status.ts src/commands/status.test.ts
git commit -m "feat: surface stalled sessions in status"
```

## Chunk 2: Docs And Full Verification

### Task 3: Update operator-facing docs

**Files:**
- Modify: `docs/cli-contract.md`
- Modify: `docs/current-state.md`

- [ ] **Step 1: Update the CLI contract for stalled-session behavior**

Document in `docs/cli-contract.md` that:
- `sy status` derives a passive stalled-session hint for quiet active sessions
- unread inbound operator mail still wins over stalled follow-up
- stalled `RECENT` output augments existing concrete summaries instead of replacing them
- operator-only activity does not reset the stalled idle clock

- [ ] **Step 2: Update the current-state snapshot**

Add the completed slice to `docs/current-state.md` using the same operator-facing language as the implementation:
- passive stalled-session visibility in `sy status`
- separate idle-clock behavior from `UPDATED`
- preserved concrete recent-summary diagnostics

- [ ] **Step 3: Run a docs sanity pass**

Run:

```bash
rg -n "stalled|idle clock|runtime.stalled" docs/cli-contract.md docs/current-state.md src/mail/store.ts src/commands/status.ts src/commands/status.test.ts
```

Expected:
- the implementation terms and docs terms match
- no leftover wording suggests a new durable session state or new event type

- [ ] **Step 4: Commit the docs checkpoint**

```bash
git add docs/cli-contract.md docs/current-state.md
git commit -m "docs: describe stalled status visibility"
```

### Task 4: Run full verification and prepare handoff

**Files:**
- Modify: none
- Test: `src/commands/status.test.ts`

- [ ] **Step 1: Run the full project check**

Run:

```bash
npm run check
```

Expected:
- PASS
- build, typecheck, and the full test suite all succeed

- [ ] **Step 2: Review the final diff for scope drift**

Run:

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/commands/status.ts src/commands/status.test.ts docs/cli-contract.md docs/current-state.md
```

Expected:
- changes stay limited to stalled-session status behavior and its docs
- no unrelated command surface changes appear

- [ ] **Step 3: Capture operator-facing example output for the PR**

Run a narrow example command or test fixture and record one before/after-style sample for the PR description, for example:

```bash
npm test -- src/commands/status.test.ts
```

Then summarize one representative output line showing:
- `NEXT=inspect` for a stalled active session
- appended `runtime.stalled idleFor=...` text in `RECENT`

- [ ] **Step 4: Commit any final polish if needed**

```bash
git add src/mail/store.ts src/mail/store.test.ts src/commands/status.ts src/commands/status.test.ts docs/cli-contract.md docs/current-state.md
git commit -m "chore: finalize stalled status slice"
```

- [ ] **Step 5: Request review before merge**

Use `@requesting-code-review` against the implementation diff before opening or updating the feature PR.
