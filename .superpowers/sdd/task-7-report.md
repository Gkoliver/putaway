# Task 7 report: Commands pipeline

## Status

Implemented the PHP commands API pipeline with regex-first interpretation and OpenAI fallback.

## Delivered

- `POST /api/commands` accepts Expo JSON commands/transcripts and multipart audio.
- Bearer authentication and household membership enforcement.
- Regex interpreter for put-away, take-out, find, and find-usual phrases.
- OpenAI extraction for unmatched transcripts and multi-item rambles.
- `put_away_batch` clarification with a confirmed command payload.
- Command handling for put-away, take-out, find, find-usual, and confirmed batches.
- SQLite-tested inventory increments/decrements and receipt replay idempotency.
- OpenAI-backed suggest-on-miss with an injectable HTTP transport.
- Audio provider failures return the Expo-compatible `voice_unavailable` outcome.
- OpenAI client supports extraction, catalog suggestions, and transcription.

## TDD evidence

Each new area was first run as a failing focused PHPUnit test before implementation:

- `InterpreterTest.php`
- `CommandHandlerTest.php`
- `OpenAiClientTest.php`
- `CommandControllerTest.php`

Final verification:

```text
PHPUnit: OK (41 tests, 120 assertions)
PHP syntax: no errors in changed production files
IDE diagnostics: no linter errors
git diff --check: clean
```

## Concerns

- OpenAI behavior is verified through injected HTTP stubs; no real provider request is made in tests.
- Multipart upload handling is covered with a synthetic uploaded-file request, not a web-server integration test.
- Handler tests intentionally use SQLite; production MySQL schema compatibility is exercised by portable SQL but not by a MySQL integration suite.
# Task 7 Report: Command handler

**Status:** DONE_WITH_CONCERNS  
**Branch:** `feat/putaway-v1`  
**Commit:** `4070c19` `feat: add inventory command handler`

## What shipped

- `apps/web/src/lib/inventory/handler.ts` — `handleCommand`
- `apps/web/src/lib/inventory/handler.test.ts` — brief tests verbatim

## Behavior

`handleCommand(db, { userId, householdId, command })` checks membership first. No membership → `{ type: "error", code: "forbidden", spoken: "You don't have access to that household." }`.

Resolve + write run inside `db.transaction`. Create items/locations only when `intent === "put_away"`. Matching is delegated to `resolveItem` / `resolveLocationPath` (not reimplemented).

- **Item:** `command.itemId` must belong to the household; otherwise `resolveItem`. Ambiguous → `which_item`. Unknown → `I don't have ${itemText} yet.`
- **Location:** `command.locationId` must belong to the household and not be archived; otherwise `locationPath` via `resolveLocationPath`. Ambiguous path → `which_location`. Unknown → `I don't have a place called ${segment}.`
- **put_away:** `incrementLot`, spoken `Added ${qty} ${name} to ${pathLabel}. Now ${newQty}.`
- **take_out:** named location → decrement that lot. Else in-stock lots: 2+ → `which_location` (`Kitchen (4) or Basement (8)?`); 1 → decrement; 0 → usual lot or unknown. Clamped: `Only ${onHand} left in ${pathLabel}. Marked 0.` Else: `Took ${taken} ${name} from ${pathLabel}. Now ${newQty}.`
- **find:** in-stock `${name} — ${pathLabel} (${qty})` joined with `; `; if none, `You're out. You usually keep them in ${usualPath}.`
- **find_usual:** rank non-archived lots by `put_away_count` desc, then `last_activity_at` desc. Spoken `You usually store ${name} at ${pathLabel}.`

## TDD evidence

### RED

Command:

```bash
TEST_DATABASE_URL=postgresql://putaway:putaway@localhost:5432/putaway_test \
  npx pnpm@10.14.0 --filter @putaway/web exec vitest run src/lib/inventory/handler.test.ts
```

Result: **FAIL** as expected

```
FAIL  src/lib/inventory/handler.test.ts [ src/lib/inventory/handler.test.ts ]
Error: Cannot find module './handler' imported from
'/Users/germaineoliver/Projects/put-away/apps/web/src/lib/inventory/handler.test.ts'
```

Failure reason: implementation file did not exist yet (not a typo / bad assertion).

### GREEN

After adding `handler.ts`:

```
✓ src/lib/inventory/handler.test.ts (6 tests) 147ms
Test Files  1 passed (1)
     Tests  6 passed (6)
```

### Related tests (sequential)

`TEST_DATABASE_URL=postgresql://putaway:putaway@localhost:5432/putaway_test`

```bash
npx pnpm@10.14.0 --filter @putaway/web exec vitest run --fileParallelism=false \
  src/lib/households.test.ts src/lib/inventory/locations.test.ts \
  src/lib/inventory/items-lots.test.ts src/lib/inventory/handler.test.ts
```

```
✓ src/lib/inventory/items-lots.test.ts (9 tests) 180ms
✓ src/lib/inventory/handler.test.ts (6 tests) 145ms
✓ src/lib/inventory/locations.test.ts (8 tests) 142ms
✓ src/lib/households.test.ts (6 tests) 109ms

Test Files  4 passed (4)
     Tests  29 passed (29)
```

## Self-review

### Strengths

- Tests are the brief’s exact cases: second put-away increments to 3, take-out with two in-stock lots asks `which_location`, take-out to 0 keeps the lot and find falls back to usual place, find_usual ranks by `put_away_count`, ambiguous “towels” asks `which_item`, household B cannot read household A.
- Handler composes `requireMembership`, `resolveItem`, `resolveLocationPath`, `pathLabelFor`, `incrementLot`, `decrementLot`, `listLotsForItem`. No matching reimplementation.
- Membership is checked before any resolve/write. Create flags are `put_away` only.
- Resolve + write are wrapped in `db.transaction`; `tx` is passed through so created items/locations are visible to lot writes on the same connection.
- Spoken strings use the brief templates.

### Issues

#### Important (untested specified behavior)

- **Exact spoken strings:** tests only assert fragments (`Now 3`, `/You're out/i`, `basement`). Full put-away / find / take-out / clamped templates are implemented but not locked by assertions.
- **`locationId` resubmit:** `command.locationId` (household + not archived) is implemented for the clarification round-trip; no handler test resubmits take-out with `locationId`.
- **Take-out clamped:** `Only ${onHand} left in ${pathLabel}. Marked 0.` is implemented; the brief suite never over-takes.
- **Unknown location:** take-out/find with a missing path returns `unknown_location` via `resolveLocationPath`; not covered by the brief tests.
- **Ambiguous location path:** `resolveLocationPath` `ambiguous_location` is mapped to `which_location` with `quantity: 0` on candidates (path match, not lot qty). Untested.

#### Minor

- `incrementLot` / `decrementLot` each start their own transaction; calling them with the outer `tx` nests savepoints. Tests pass; a later extract of “apply without inner tx” would avoid double wrapping.
- Find / find_usual / take-out with an item but no lots at all returns `unknown_location` and `that place` when no segment was spoken. Not specified; not tested.
- Find with a valid `locationPath` validates the place then still lists all in-stock lots (does not filter to that node).
- `tx as unknown as Database` is required because Drizzle’s transaction client is not the same type as `getDb()`.

## Assessment

Core Task 7 path is implemented, TDD red/green was observed, households + locations + items-lots + handler tests passed, and the feature commit is on `feat/putaway-v1`. Concerns are committed-suite gaps for exact spoken strings, `locationId` resubmit, clamped take-out, and unknown/ambiguous location — not blockers for the six required tests.

---

## Review fix (2026-09-07)

**Status:** DONE  
**Commit:** `762c0d1` `fix: fill path-ambiguity qty and map lot write errors`

### What changed

- **`ambiguous_location` candidates:** `resolveCommandLocation` now receives the resolved `itemId` and fills each candidate's `quantity` from `listLotsForItem` (0 only when no lot exists at that location).
- **Lot write errors:** `put_away` and `decrementAt` guard non-positive quantity before calling `incrementLot` / `decrementLot`, and catch lot-layer throws (`quantity must be positive`, `location is archived`, cross-household ids) via `mapLotWriteError`, returning `{ type: "error", ... }` instead of propagating.

### Covering tests

Command:

```bash
TEST_DATABASE_URL=postgresql://putaway:putaway@localhost:5432/putaway_test \
  npx pnpm@10.14.0 --filter @putaway/web exec vitest run src/lib/inventory/handler.test.ts
```

Result: **PASS**

```
 RUN  v3.2.7 /Users/germaineoliver/Projects/put-away/apps/web

 ✓ src/lib/inventory/handler.test.ts (6 tests) 146ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  20:49:56
   Duration  477ms (transform 43ms, setup 0ms, collect 197ms, tests 146ms, environment 0ms, prepare 30ms)
```

---

## Review fix 2 (2026-09-07)

**Status:** DONE  
**Commit:** `bc04f69` `fix: roll back failed put-away writes and lock take-out spoken qty`

### What changed

- **Error-path rollback:** `handleCommand` throws a `RollbackOutcome` for any `{ type: "error" }` from inside `db.transaction`, then returns that outcome after rollback. Failed put-away no longer commits created items/locations. `ok` and `clarification` (including take-out `which_location`, which does not write) still commit.
- **Clamped take-out spoken qty:** Removed the unlocked pre-decrement `listLotsForItem` read. Clamped spoken uses `decrementLot`'s post-decrement `quantity` (0).
- **Tests:** put-away quantity 0 leaves no item/location; clamped take-out speaks `Only 0 left in Basement. Marked 0.`; take-out with `locationPath: ["hall"]` against Hall closet (4) and Hall cabinet (8) returns candidate quantities `[4, 8]`.

### Covering tests

Command:

```bash
TEST_DATABASE_URL=postgresql://putaway:putaway@localhost:5432/putaway_test \
  npx pnpm@10.14.0 --filter @putaway/web exec vitest run src/lib/inventory/handler.test.ts
```

Result: **PASS**

```
 RUN  v3.2.7 /Users/germaineoliver/Projects/put-away/apps/web

 ✓ src/lib/inventory/handler.test.ts (9 tests) 192ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  20:52:52
   Duration  540ms (transform 44ms, setup 0ms, collect 216ms, tests 192ms, environment 0ms, prepare 31ms)
```

---

## Spec regression fix (2026-09-07)

**Status:** DONE  
**Commit:** `d564951` `fix: use pre-decrement on-hand for clamped take-out spoken`

### What changed

- **`decrementLot`:** Extended `DecrementLotResult` with `previousQuantity` (on-hand before decrement), captured inside the locked `FOR UPDATE` read.
- **Handler:** Clamped take-out spoken uses `decremented.previousQuantity` for `Only ${onHand} left in ${pathLabel}. Marked 0.` instead of post-decrement `quantity` (0).
- **Tests:** Handler clamped take-out expects `Only 2 left in Basement. Marked 0.` (had 2, asked for 5); items-lots over-take assertion includes `previousQuantity: 2`.

### Covering tests

Command:

```bash
TEST_DATABASE_URL=postgresql://putaway:putaway@localhost:5432/putaway_test \
  npx pnpm@10.14.0 --filter @putaway/web exec vitest run --fileParallelism=false \
  src/lib/inventory/handler.test.ts src/lib/inventory/items-lots.test.ts
```

Result: **PASS**

```
 RUN  v3.2.7 /Users/germaineoliver/Projects/put-away/apps/web

 ✓ src/lib/inventory/handler.test.ts (9 tests) 200ms
 ✓ src/lib/inventory/items-lots.test.ts (9 tests) 178ms

 Test Files  2 passed (2)
      Tests  18 passed (18)
   Start at  20:54:00
   Duration  915ms (transform 47ms, setup 0ms, collect 360ms, tests 378ms, environment 0ms, prepare 47ms)
```
