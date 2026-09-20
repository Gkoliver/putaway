# Putaway shared-host rewrite (PHP + MySQL)

**Date:** 2026-09-20  
**Status:** Approved for planning  
**Goal:** Run Putaway on existing iWebFusion Starter + put-away.com, using MySQL and host mail, while keeping the Expo mobile app. Drop Neon, Vercel, and Resend.

## Decisions locked

| Topic | Choice |
| --- | --- |
| Host | iWebFusion Starter (cPanel, PHP, MySQL, email) |
| Domain | put-away.com (already on that cPanel) |
| Mobile | Keep Expo; rewrite backend only |
| Backend | PHP + MySQL |
| Auth | Magic link via iWebFusion SMTP / PHP mail |
| AI | Keep OpenAI (transcription, extract, suggest) |
| Web v1 | Lean: sign-in, inventory, places, basic edit (not full Next parity) |
| Talk | Phone-first (Expo) |

## Architecture

```
put-away.com/           → lean PHP web UI
put-away.com/api/...    → JSON API for Expo (+ shared auth)

Expo app ──HTTPS──► put-away.com/api
Browser  ──HTTPS──► put-away.com (pages)
PHP ──► MySQL (localhost)
PHP ──► OpenAI (external)
PHP ──► iWebFusion mail (magic links)
```

### What goes away (production)

- Neon Postgres
- Vercel
- Resend
- Better Auth
- Next.js as the production API/web host

### What stays

- Expo mobile UX (Talk, List, Places, edit flows)
- Product model: households, members, location tree, items, stock lots, command receipts, invites, command outcomes
- OpenAI-backed voice/extract/suggest (server-side key only)

### Repo shape

- Add `apps/server` (PHP application: API + lean web)
- Keep `apps/mobile` and `packages/shared` (shared types/interpreter where useful; PHP owns authoritative command handling)
- Keep `apps/web` (Next) in-repo as archive until cutover is proven; remove later

## Auth

1. User submits email (web or mobile).
2. PHP stores a one-time magic-link token and emails `https://put-away.com/auth/verify?token=…` via host mail.
3. Verify endpoint creates a server session.
4. **Web:** HTTP-only session cookie.
5. **Expo:** bearer token (SecureStore), same authorization story as today after verify/exchange.
6. Sign-out invalidates the session server-side.

Failures: do not report success if mail send fails; 401 for missing/invalid session.

## Data model (MySQL)

Port of the current Postgres schema:

- `users`, `sessions`, `magic_link_tokens`
- `households`, `household_members` (roles: owner | member), `invites`
- `locations` (tree via `parent_id`, archive support), `items`, `stock_lots`
- `command_receipts` (idempotency on household + user + clientCommandId)

Primary keys: UUID strings (`CHAR(36)`) for mobile-friendly IDs.

## API surface

Preserve Expo-facing contracts where practical:

| Area | Endpoints (illustrative) |
| --- | --- |
| Auth | `POST /api/auth/magic-link`, verify, sign-out, session/me |
| Households | `GET/POST /api/households`, invite create/accept |
| Inventory | `GET/PATCH /api/households/{id}/inventory` |
| Locations | `GET/POST/PATCH /api/households/{id}/locations` |
| Commands | `POST /api/commands` (transcript and/or audio) → ok / clarification / error |

Command handling includes put_away, take_out, find, find_usual, put_away_batch + confirm, suggest-on-miss, and spoken error paths (including voice unavailable).

## Lean web UI (v1)

- Sign-in (magic link)
- Household selection
- Inventory list + search + basic edit
- Places tree + create / rename / reparent
- No full web Talk UI in this phase

## OpenAI

- Called only from PHP
- Transcription for uploaded audio
- Extract for intents / ramble batches
- Item suggestions on miss
- On provider failure: return existing-style “type it instead” / clear spoken error

## Security

- HTTPS only on put-away.com
- Secrets outside public web root (or env equivalent on cPanel)
- Prepared statements for all SQL
- CSRF protection on cookie-authenticated web forms
- Bearer auth for API
- Light rate limiting on magic-link issuance

## Error handling

- Prefer existing mobile-friendly JSON outcome shapes (`spoken`, clarification types)
- 401 unauthenticated, 403 not a household member
- Mail/OpenAI failures surfaced explicitly

## Testing & cutover

1. Implement PHP app + MySQL schema on put-away.com.
2. Fresh production data (no required automated Neon→MySQL migration for v1).
3. Point Expo `EXPO_PUBLIC_API_BASE` to `https://put-away.com`; rebuild app.
4. Smoke: magic link (web + phone), inventory CRUD, places tree, Talk put-away/take-out/find, batch confirm, invite.
5. Decommission Vercel/Neon/Resend for Putaway.
6. Archive/remove Next web when stable.

## Out of scope

- Flutter rewrite
- Keeping Postgres / Better Auth / Next in production
- Full marketing redesign or full web Talk parity
- Automatic migration of live Neon data

## Success criteria

- Household can use Expo Talk + List + Places against put-away.com with no Neon/Vercel/Resend
- Magic links arrive via iWebFusion mail
- Lean website usable for inventory/places on put-away.com
- Only ongoing external usage bill is OpenAI (plus existing hosting)
