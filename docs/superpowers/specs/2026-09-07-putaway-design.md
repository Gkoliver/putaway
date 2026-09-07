# Putaway Design

Household inventory you can talk to. Two people in the same house should be able to say what they put away, where it went, and how many — then ask where it is, or where it usually lives, even when they are out.

v1 is a few households (the builders plus family). The same model should grow into a product later without rewriting tenants, clients, or the inventory core.

## Goals

- Speak put-away, find, “where do we usually store this?”, and take-out from an iPhone and an Android phone.
- Track **location + quantity**, including the same item in more than one place.
- Infer a location tree from natural speech (“shelf A on the metal shelves in the basement”).
- Manage households, inventory, and messy locations on the web.
- Keep empty storage facts so “usual place” still works at quantity 0.

## Non-goals (v1)

- Custom wake word, Alexa, or Google Home.
- Expiry dates, photos, categories, or low-stock alerts.
- Billing, public signup marketing, or store-wide launch.
- Separate native iOS and Android codebases.
- A full history/event ledger (reporting can come later).
- Auto-suggesting a location when put-away omits one (easy follow-on once usual-place ranking exists).

## Users and tenancy

- A **user** has an account (email magic-link sign-in).
- A **household** is the tenant. All inventory data is scoped to it.
- Any signed-in user can **create** a household and becomes its `owner`.
- Other users join by **invite** (email or link). Roles: `owner` | `member`.
- A user may belong to more than one household. The client sends the active `household_id` on each request; the server accepts it only if a membership row exists.
- The API never trusts a client-sent household id without that membership check.

## Architecture

TypeScript monorepo:

| Piece | Role |
| --- | --- |
| `apps/mobile` (Expo / React Native) | Daily loop: voice, confirmations, disambiguation, simple lists |
| `apps/web` (Next.js) | Invites, inventory table, location tree rename/merge, later reporting |
| Next.js API routes | Only writer of inventory. Mobile and web are clients. |
| `packages/shared` | Command types, item/location types, shared validation |
| Postgres | Source of truth |

```
Expo app / Next.js web
        ↓  HTTPS + session
   Next.js API  →  Voice interpreter  →  Inventory domain  →  Postgres
```

Voice intelligence lives on the server. The phone sends audio (or text). The interpreter returns a structured command. Domain logic applies it. The interpreter is testable with transcripts; it does not need a microphone.

**v1 vendors (replaceable):** Neon Postgres, Better Auth, OpenAI speech-to-text plus structured LLM extract, Expo EAS for TestFlight and Play internal testing, Vercel for web/API.

Web uses cookie sessions. The Expo app uses Better Auth’s bearer/session token. Both hit the same Next.js API.

## Components

### Households and members

Creates the tenant and who may see it. Invite accept writes a membership. Owners can invite and merge locations. Members can voice-update inventory and view the web inventory.

### Items

Household-scoped catalog entry with a canonical name (`Paper towels`). Matching order: case-insensitive exact name, then simple singular/plural, then a high-threshold similarity score. Put-away creates the item only if nothing clears that threshold. Find / take-out / usual-place do not create items.

### Location tree

Nodes with parent, name, and path (`Basement → Metal shelves → Shelf A`). Spoken paths are split into ordered segments, then each segment is matched with the same rules as items (exact, singular/plural, high-threshold similarity) among **non-archived** siblings. Put-away creates missing nodes. Take-out and find never create locations. Find, find-usual, and take-out ignore lots whose location is archived.

Web can rename, move, and **merge** nodes. Merge is required because speech will produce near-duplicates (`metal shelf` vs `metal shelves`).

### Stock lots

A lot is “this item has a known place here,” not “we currently have some.”

- Unique on `(household_id, item_id, location_id)` where `location_id` is a leaf.
- `quantity` is a non-negative integer and **may be 0**.
- `put_away_count` increments on every successful put-away.
- `last_activity_at` updates on put-away and take-out.

Take-out to 0 **keeps** the row. Do not delete empty lots. Archive or merge one-off places on the web (tape left on the dining table once).

### Voice interpreter

Input: transcript plus household context. Output: a command or a clarification. No database writes.

Intents: `put_away` | `take_out` | `find` | `find_usual`.

Fields: item text, optional quantity (default **1**), optional location path.

### Command handler

The only writer. Executes put-away / find / take-out / find-usual against items, tree, and lots. Mobile voice, mobile text fallback, and web forms all call the same functions.

### Clients

- **Mobile:** hold-to-talk, confirmation card, `which_location?` / `which_item?` picker, inventory list, household switcher, text fallback when voice is down.
- **Web:** members and invites, inventory table (including zeros), location tree editor, merge with preview.

## Data model

```
users
  id, email, name, timestamps

households
  id, name, timestamps

household_members
  household_id, user_id, role (owner | member), unique (household_id, user_id)

invites
  id, household_id, email, role, token, expires_at, accepted_at

items
  id, household_id, name, unique (household_id, lower(name))

locations
  id, household_id, parent_id null, name, archived_at null, timestamps
  unique sibling name: (household_id, coalesce(parent_id, zero-uuid), lower(name)) among non-archived rows

stock_lots
  id, household_id, item_id, location_id, quantity, put_away_count, last_activity_at
  unique (household_id, item_id, location_id)

command_receipts
  id, household_id, user_id, client_command_id, result_json, created_at
  unique (household_id, user_id, client_command_id)
```

Location display path is derived by walking parents. Do not store a denormalized path string as the source of truth.

## Data flow

Every voice turn: app sends audio or text plus active `household_id` and a client `command_id`. API returns a **result** or a **clarification**.

1. **Interpret** — audio → transcript → command.
2. **Resolve item** — fuzzy match. Create only on put-away.
3. **Resolve location** — if spoken, walk/create (create only on put-away).
4. **Apply** in one transaction.

**Put-away.** Increment the lot (create if needed). Bump `put_away_count` and `last_activity_at`. Confirm: “Added 2 paper towels to Basement → Metal shelves → Shelf A. Now 5.”

**Find.** Lots with `quantity > 0`. If none: “You’re out. You usually keep them in …” using usual-place ranking.

**Find usual.** Rank lots by `put_away_count` desc, then `last_activity_at` desc, **including zeros**.

**Take-out.** If the user named a location, decrement that lot. If exactly one lot has `quantity > 0`, decrement it. If several in-stock lots and no location, return `which_location?` with candidates; the app asks and resubmits with `location_id`. Never decrement below 0. If they ask for more than on hand: set 0 and say so. Do not pull from another location.

**Web.** Same domain functions, no interpreter. Invite writes membership. Merge is for duplicate places: lots for the same item add quantities; `put_away_count` keeps the higher value (do not double-count the same physical spot); `last_activity_at` keeps the newer value; source location gets `archived_at` and is hidden from resolve and from the tree UI. Archived nodes are not reused for new put-aways.

## Error handling

- Interpret → resolve → write is one transaction. Failure after a write starts rolls back.
- Empty transcript: “I didn’t catch that.” No writes.
- Interpreter missing item or unusable location: one follow-up question. Do not invent a new item or room.
- STT/LLM unavailable: “Voice is unavailable — type it instead.” Text hits the same command endpoint.
- Unknown item on find / take-out / usual: “I don’t have paper towels yet.”
- Unknown location on take-out / find: “I don’t have a place called X.” Do not create it.
- Ambiguous item (paper towels vs bath towels): `which_item?`, same pattern as locations.
- No membership or no active household: 403; client sends the user to household pick or invite.
- Take-out over quantity: set that lot to 0 and explain. Do not borrow from another lot.
- Illegal merge (same node, or cross-household): reject.
- Duplicate `command_id` for the same user and household: return the original result; do not apply twice.
- Web invite expired or already used: a plain message.
- Merge requires a preview of lots that will combine, then confirm.

## Testing

Test the interpreter and command handler with **text**, not a microphone.

**Interpreter unit tests.** Transcript fixtures → expected command. Cover put-away with nested location, find, find-usual, take-out, and messy phrasing (“paper towel,” “downstairs”).

**Command handler integration tests (real Postgres).** Put-away creates item + path + lot. Second put-away increments. Take-out with two in-stock lots returns clarification. Take-out to 0 keeps the lot. Find hides zeros and falls back to usual place. Find-usual ranks by `put_away_count`. Merge combines lots. Household B cannot read household A.

**API tests.** No membership → 403. Duplicate `command_id` → one write. Clarification round-trip completes the decrement.

**Client tests (thin).** Mobile disambiguation UI against a mock API. Web merge preview and invite accept.

**CI does not** automate on-device speech recognition.

**Manual gate for “v1 usable.”** One iPhone (TestFlight) and one Android (Play internal): put-away, find, take-out, out-of-stock usual place, location merge.

## v1 client behavior

- Primary surface is the Expo app on iOS and Android from day one (builders are on opposite platforms).
- Web is not the daily capture path.
- Default quantity is 1 when the user does not say a number.
- Confirmations always include item, location path, and resulting quantity.

## Path to a product

Do not build billing or public onboarding in v1. Keep the hard boundaries that make that work later: user ≠ household, membership checks on every query, one inventory domain, two thin clients. Adding signup, plans, and extra households should not require a new data model.
